module github.com/gitpod-io/gitpod/docker-up

go 1.24

toolchain go1.24.3

godebug tlsmlkem=0

require (
	github.com/opencontainers/runtime-spec v1.2.0
	github.com/rootless-containers/rootlesskit v1.1.1
	github.com/sirupsen/logrus v1.9.3
	github.com/spf13/pflag v1.0.6
	github.com/vishvananda/netlink v1.3.0
	golang.org/x/sys v0.30.0
	golang.org/x/xerrors v0.0.0-20240903120638-7835f813f4da
)

require github.com/vishvananda/netns v0.0.4 // indirect

replace github.com/gitpod-io/gitpod/common-go => ../common-go // leeway

replace github.com/gitpod-io/gitpod/components/scrubber => ../scrubber // leeway

replace k8s.io/api => k8s.io/api v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/apiextensions-apiserver => k8s.io/apiextensions-apiserver v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/apimachinery => k8s.io/apimachinery v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/apiserver => k8s.io/apiserver v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/cli-runtime => k8s.io/cli-runtime v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/client-go => k8s.io/client-go v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/cloud-provider => k8s.io/cloud-provider v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/cluster-bootstrap => k8s.io/cluster-bootstrap v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/code-generator => k8s.io/code-generator v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/component-base => k8s.io/component-base v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/cri-api => k8s.io/cri-api v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/csi-translation-lib => k8s.io/csi-translation-lib v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/kube-aggregator => k8s.io/kube-aggregator v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/kube-controller-manager => k8s.io/kube-controller-manager v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/kube-proxy => k8s.io/kube-proxy v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/kube-scheduler => k8s.io/kube-scheduler v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/kubelet => k8s.io/kubelet v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/legacy-cloud-providers => k8s.io/legacy-cloud-providers v0.30.9 // leeway indirect from components/common-go:lib

replace k8s.io/metrics => k8s.io/metrics v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/sample-apiserver => k8s.io/sample-apiserver v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/component-helpers => k8s.io/component-helpers v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/controller-manager => k8s.io/controller-manager v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/kubectl => k8s.io/kubectl v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/mount-utils => k8s.io/mount-utils v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/pod-security-admission => k8s.io/pod-security-admission v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/dynamic-resource-allocation => k8s.io/dynamic-resource-allocation v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/endpointslice => k8s.io/endpointslice v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/kms => k8s.io/kms v0.31.9 // leeway indirect from components/common-go:lib

replace k8s.io/cri-client => k8s.io/cri-client v0.31.9 // leeway indirect from components/common-go:lib
