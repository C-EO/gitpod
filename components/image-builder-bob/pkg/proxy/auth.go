// Copyright (c) 2021 Gitpod GmbH. All rights reserved.
// Licensed under the GNU Affero General Public License (AGPL).
// See License.AGPL.txt in the project root for license information.

package proxy

import (
	"encoding/base64"
	"encoding/json"
	"regexp"
	"strings"

	"github.com/gitpod-io/gitpod/common-go/log"
	"github.com/sirupsen/logrus"
)

var ecrRegistryRegexp = regexp.MustCompile(`\d{12}.dkr.ecr.\w+-\w+-\w+.amazonaws.com`)

const DummyECRRegistryDomain = "000000000000.dkr.ecr.dummy-host-zone.amazonaws.com"

// isECRRegistry returns true if the registry domain is an ECR registry
func isECRRegistry(domain string) bool {
	return ecrRegistryRegexp.MatchString(domain)
}

// isDockerHubRegistry returns true if the registry domain is an docker hub
func isDockerHubRegistry(domain string) bool {
	switch domain {
	case "registry-1.docker.io":
		fallthrough
	case "docker.io":
		return true
	default:
		return false
	}
}

// authConfig configures authentication for a single host
type authConfig struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Auth     string `json:"auth"`
}

type MapAuthorizer map[string]authConfig

func (a MapAuthorizer) Authorize(hostHeader string) (user, pass string, err error) {
	defer func() {
		log.WithFields(logrus.Fields{
			"host": hostHeader,
			"user": user,
		}).Info("authorizing registry access")
	}()

	parseHostHeader := func(hostHeader string) (string, string) {
		hostHeaderSlice := strings.Split(hostHeader, ":")
		hostname := strings.TrimSpace(hostHeaderSlice[0])
		var port string
		if len(hostHeaderSlice) > 1 {
			port = strings.TrimSpace(hostHeaderSlice[1])
		}
		return hostname, port
	}
	hostname, port := parseHostHeader(hostHeader)
	// gpl: Could be port 80 as well, but we don't know if we are servinc http or https, we assume https
	if port == "" {
		port = "443"
	}
	host := hostname + ":" + port

	explicitHostMatcher := func() (authConfig, bool) {
		// 1. precise host match
		res, ok := a[host]
		if ok {
			return res, ok
		}

		// 2. make sure we not have a hostname match
		res, ok = a[hostname]
		return res, ok
	}
	ecrHostMatcher := func() (authConfig, bool) {
		if isECRRegistry(hostname) {
			res, ok := a[DummyECRRegistryDomain]
			return res, ok
		}
		return authConfig{}, false
	}
	dockerHubHostMatcher := func() (authConfig, bool) {
		if isDockerHubRegistry(hostname) {
			res, ok := a["docker.io"]
			return res, ok
		}
		return authConfig{}, false
	}

	matchers := []func() (authConfig, bool){explicitHostMatcher, ecrHostMatcher, dockerHubHostMatcher}
	res, ok := authConfig{}, false
	for _, matcher := range matchers {
		res, ok = matcher()
		if ok {
			break
		}
	}

	if !ok {
		return
	}

	user, pass = res.Username, res.Password
	if res.Auth != "" {
		var authBytes []byte
		authBytes, err = base64.StdEncoding.DecodeString(res.Auth)
		if err != nil {
			return
		}
		auth := strings.TrimSpace(string(authBytes))
		segs := strings.Split(auth, ":")
		if len(segs) < 2 {
			return
		}

		user = segs[0]
		pass = strings.Join(segs[1:], ":")
	}

	return
}

func (a MapAuthorizer) AddIfNotExists(other MapAuthorizer) MapAuthorizer {
	res := make(map[string]authConfig)
	for k, v := range a {
		res[k] = v
	}
	for k, v := range other {
		if _, ok := a[k]; ok {
			log.Infof("Skip adding key: %s to MapAuthorizer as it already exists", k)
			continue
		}
		res[k] = v
	}
	return MapAuthorizer(res)
}

type Authorizer interface {
	Authorize(host string) (user, pass string, err error)
}

func NewAuthorizerFromDockerEnvVar(content string) (auth MapAuthorizer, err error) {
	var res struct {
		Auths map[string]authConfig `json:"auths"`
	}
	err = json.Unmarshal([]byte(content), &res)
	if err != nil {
		return
	}
	return MapAuthorizer(res.Auths), nil
}

func NewAuthorizerFromEnvVar(content string) (auth MapAuthorizer, err error) {
	if content == "" {
		return nil, nil
	}

	var res map[string]authConfig
	err = json.Unmarshal([]byte(content), &res)
	if err != nil {
		return nil, err
	}
	return MapAuthorizer(res), nil
}
