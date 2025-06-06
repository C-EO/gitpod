/**
 * Copyright (c) 2023 Gitpod GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License.AGPL.txt in the project root for license information.
 */

import { v1 } from "@authzed/authzed-node";
import { log } from "@gitpod/gitpod-protocol/lib/util/logging";
import { TrustedValue } from "@gitpod/gitpod-protocol/lib/util/scrubbing";

import { incSpiceDBRequestsCheckTotal, observeSpicedbClientLatency, spicedbClientLatency } from "../prometheus-metrics";
import { SpiceDBClientProvider } from "./spicedb";
import * as grpc from "@grpc/grpc-js";
import { base64decode } from "@jmondi/oauth2-server";
import { DecodedZedToken } from "@gitpod/spicedb-impl/lib/impl/v1/impl.pb";
import { ctxTryGetCache, ctxTrySetCache } from "../util/request-context";
import { ApplicationError, ErrorCodes } from "@gitpod/gitpod-protocol/lib/messaging/error";
import { isGrpcError } from "@gitpod/gitpod-protocol/lib/util/grpc";

export function createSpiceDBAuthorizer(clientProvider: SpiceDBClientProvider): SpiceDBAuthorizer {
    return new SpiceDBAuthorizer(clientProvider, new RequestLocalZedTokenCache());
}

interface CheckResult {
    permitted: boolean;
    checkedAt?: string;
}

interface DeletionResult {
    relationships: v1.ReadRelationshipsResponse[];
    deletedAt?: string;
}

const GRPC_DEADLINE = 10_000;

export class SpiceDBAuthorizer {
    constructor(private readonly clientProvider: SpiceDBClientProvider, private readonly tokenCache: ZedTokenCache) {}

    public async check(req: v1.CheckPermissionRequest, experimentsFields: { userId: string }): Promise<boolean> {
        req.consistency = await this.tokenCache.consistency(req.resource);
        incSpiceDBRequestsCheckTotal(req.consistency?.requirement?.oneofKind || "undefined");

        const result = await this.checkInternal(req, experimentsFields);
        if (result.checkedAt) {
            await this.tokenCache.set([req.resource, result.checkedAt]);
        }
        return result.permitted;
    }

    private async checkInternal(
        req: v1.CheckPermissionRequest,
        experimentsFields: {
            userId: string;
        },
    ): Promise<CheckResult> {
        const result = (async () => {
            const timer = spicedbClientLatency.startTimer();
            let error: Error | undefined;
            try {
                const response = await this.call("[spicedb] Error performing authorization check.", (client) =>
                    client.checkPermission(req, this.callOptions),
                );
                const permitted = response.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION;
                return { permitted, checkedAt: response.checkedAt?.token };
            } catch (err) {
                // we should not consider users supplying invalid requests as internal server errors
                if (isGrpcError(err) && err.code === grpc.status.INVALID_ARGUMENT) {
                    throw new ApplicationError(ErrorCodes.BAD_REQUEST, `Invalid request for permission check: ${err}`);
                }
                error = err;
                log.error("[spicedb] Failed to perform authorization check.", err, {
                    request: new TrustedValue(req),
                });
                throw new ApplicationError(ErrorCodes.INTERNAL_SERVER_ERROR, "Failed to perform authorization check.");
            } finally {
                observeSpicedbClientLatency("check", error, timer());
            }
        })();
        return result;
    }

    async writeRelationships(...updates: v1.RelationshipUpdate[]): Promise<v1.WriteRelationshipsResponse | undefined> {
        const result = await this.writeRelationshipsInternal(...updates);
        const writtenAt = result?.writtenAt?.token;
        await this.tokenCache.set(
            ...updates.map<ZedTokenCacheKV>((u) => [
                u.relationship?.resource,
                writtenAt, // Make sure that in case we don't get a writtenAt token here, we at least invalidate the cache
            ]),
        );
        return result;
    }

    private async writeRelationshipsInternal(
        ...updates: v1.RelationshipUpdate[]
    ): Promise<v1.WriteRelationshipsResponse | undefined> {
        const timer = spicedbClientLatency.startTimer();
        let error: Error | undefined;
        try {
            const response = await this.call("[spicedb] Failed to write relationships.", (client) =>
                client.writeRelationships(
                    v1.WriteRelationshipsRequest.create({
                        updates,
                    }),
                    this.callOptions,
                ),
            );
            log.info("[spicedb] Successfully wrote relationships.", {
                response: new TrustedValue(response),
                updates: new TrustedValue(updates),
            });

            return response;
        } finally {
            observeSpicedbClientLatency("write", error, timer());
        }
    }

    async deleteRelationships(req: v1.DeleteRelationshipsRequest): Promise<v1.ReadRelationshipsResponse[]> {
        const result = await this.deleteRelationshipsInternal(req);
        log.info(`[spicedb] Deletion result`, { result });
        const deletedAt = result?.deletedAt;
        if (deletedAt) {
            await this.tokenCache.set(
                ...result.relationships.map<ZedTokenCacheKV>((r) => [r.relationship?.resource, deletedAt]),
            );
        }
        return result.relationships;
    }

    private async deleteRelationshipsInternal(req: v1.DeleteRelationshipsRequest): Promise<DeletionResult> {
        const timer = spicedbClientLatency.startTimer();
        let error: Error | undefined;
        try {
            let deletedAt: string | undefined = undefined;
            const existing = await this.call("readRelationships before deleteRelationships failed.", (client) =>
                client.readRelationships(v1.ReadRelationshipsRequest.create(req), this.callOptions),
            );
            if (existing.length > 0) {
                const response = await this.call("deleteRelationships failed.", (client) =>
                    client.deleteRelationships(req, this.callOptions),
                );
                deletedAt = response.deletedAt?.token;
                const after = await this.call("readRelationships failed.", (client) =>
                    client.readRelationships(v1.ReadRelationshipsRequest.create(req), this.callOptions),
                );
                if (after.length > 0) {
                    log.error("[spicedb] Failed to delete relationships.", { existing, after, request: req });
                }
                log.info(`[spicedb] Successfully deleted ${existing.length} relationships.`, {
                    response,
                    request: req,
                    existing,
                });
            }
            return {
                relationships: existing,
                deletedAt,
            };
        } catch (err) {
            error = err;
            // While in we're running two authorization systems in parallel, we do not hard fail on writes.
            //TODO throw new ApplicationError(ErrorCodes.INTERNAL_SERVER_ERROR, "Failed to delete relationships.");
            log.error("[spicedb] Failed to delete relationships.", err, { request: new TrustedValue(req) });
            return { relationships: [] };
        } finally {
            observeSpicedbClientLatency("delete", error, timer());
        }
    }

    async readRelationships(req: v1.ReadRelationshipsRequest): Promise<v1.ReadRelationshipsResponse[]> {
        req.consistency = await this.tokenCache.consistency(undefined);
        incSpiceDBRequestsCheckTotal(req.consistency?.requirement?.oneofKind || "undefined");
        return this.call("readRelationships failed.", (client) => client.readRelationships(req, this.callOptions));
    }

    /**
     * call retrieves a Spicedb client and executes the given code block.
     * In addition to the gRPC-level retry mechanisms, it retries on "Waiting for LB pick" errors.
     * This is required, because we seem to be running into a grpc/grpc-js bug where a subchannel takes 120s+ to reconnect.
     * @param description
     * @param code
     * @returns
     */
    private async call<T>(description: string, code: (client: v1.ZedPromiseClientInterface) => Promise<T>): Promise<T> {
        const MAX_ATTEMPTS = 3;
        let attempt = 0;
        while (attempt++ < MAX_ATTEMPTS) {
            try {
                const checkClient = attempt > 1; // the last client error'd out, so check if we should get a new one
                const client = this.clientProvider.getClient(checkClient);
                return await code(client);
            } catch (err) {
                // Check: Is this a "no connection to upstream" error? If yes, retry here, to work around grpc/grpc-js bugs introducing high latency for re-tries
                if (
                    isGrpcError(err) &&
                    (err.code === grpc.status.DEADLINE_EXCEEDED || err.code === grpc.status.UNAVAILABLE) &&
                    attempt < MAX_ATTEMPTS
                ) {
                    let delay = 500 * attempt;
                    if (err.code === grpc.status.DEADLINE_EXCEEDED) {
                        // we already waited for timeout, so let's try again immediately
                        delay = 0;
                    }

                    log.warn(description, err, {
                        attempt,
                        delay,
                        code: err.code,
                    });
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }

                // Some other error: log and rethrow
                log.error(description, err, {
                    attempt,
                    code: err.code,
                });
                throw err;
            }
        }
        throw new Error("unreachable");
    }

    /**
     * permission_service.grpc-client.d.ts has all methods overloaded with this pattern:
     *  - xyzRelationships(input: Request, metadata?: grpc.Metadata | grpc.CallOptions, options?: grpc.CallOptions): grpc.ClientReadableStream<ReadRelationshipsResponse>;
     * But the promisified client somehow does not have the same overloads. Thus we convince it here that options may be passed as 2nd argument.
     */
    private get callOptions(): grpc.Metadata {
        return (<grpc.CallOptions>{
            deadline: Date.now() + GRPC_DEADLINE,
        }) as any as grpc.Metadata;
    }
}

type ZedTokenCacheKV = [objectRef: v1.ObjectReference | undefined, token: string | undefined];
interface ZedTokenCache {
    get(objectRef: v1.ObjectReference): Promise<string | undefined>;
    set(...kvs: ZedTokenCacheKV[]): Promise<void>;
    consistency(resourceRef: v1.ObjectReference | undefined): Promise<v1.Consistency>;
}

// "contribute" a cache shape to the request context
type ZedTokenCacheType = StoredZedToken;
const ctxCacheSetZedToken = (zedToken: StoredZedToken | undefined): void => {
    ctxTrySetCache<ZedTokenCacheType>("zedToken", zedToken);
};
const ctxCacheGetZedToken = (): StoredZedToken | undefined => {
    return ctxTryGetCache<ZedTokenCacheType>("zedToken");
};

/**
 * This is a simple implementation of the ZedTokenCache that uses the local context to store single ZedToken per API request, which is stored in AsyncLocalStorage.
 * To make this work we make the "assumption" that ZedTokens string (meant to be opaque) represent a timestamp which we can order. This is at least true for the MySQL datastore we are using.
 */
export class RequestLocalZedTokenCache implements ZedTokenCache {
    constructor() {}

    async get(objectRef: v1.ObjectReference | undefined): Promise<string | undefined> {
        return ctxCacheGetZedToken()?.token;
    }

    async set(...kvs: ZedTokenCacheKV[]) {
        function clearZedTokenOnContext() {
            ctxCacheSetZedToken(undefined);
        }

        const mustClearCache = kvs.some(([k, v]) => !!k && !v); // did we write a relationship without getting a writtenAt token?
        if (mustClearCache) {
            clearZedTokenOnContext();
            return;
        }

        try {
            const allTokens = [
                ...kvs.map(([_, v]) => (!!v ? StoredZedToken.fromToken(v) : undefined)),
                ctxCacheGetZedToken(),
            ].filter((v) => !!v) as StoredZedToken[];
            const freshest = this.freshest(...allTokens);
            if (freshest) {
                ctxCacheSetZedToken(freshest);
            }
        } catch (err) {
            log.warn("[spicedb] Failed to set ZedToken on context", err);
            clearZedTokenOnContext();
        }
    }

    async consistency(resourceRef: v1.ObjectReference | undefined): Promise<v1.Consistency> {
        function fullyConsistent() {
            return v1.Consistency.create({
                requirement: {
                    oneofKind: "fullyConsistent",
                    fullyConsistent: true,
                },
            });
        }

        const zedToken = await this.get(resourceRef);
        if (!zedToken) {
            return fullyConsistent();
        }
        return v1.Consistency.create({
            requirement: {
                oneofKind: "atLeastAsFresh",
                atLeastAsFresh: v1.ZedToken.create({
                    token: zedToken,
                }),
            },
        });
    }

    protected freshest(...zedTokens: StoredZedToken[]): StoredZedToken | undefined {
        return zedTokens.reduce<StoredZedToken | undefined>((prev, curr) => {
            if (!prev || prev.timestamp < curr.timestamp) {
                return curr;
            }
            return prev;
        }, undefined);
    }
}

export interface StoredZedToken {
    token: string;
    timestamp: number;
}
namespace StoredZedToken {
    export function create(token: string, timestamp: number): StoredZedToken {
        return { token, timestamp };
    }

    export function fromToken(token: string): StoredZedToken | undefined {
        // following https://github.com/authzed/spicedb/blob/786555c24af98abfe3f832c94dbae5ca518dcf50/pkg/zedtoken/zedtoken.go#L64-L100
        const decodedBytes = base64decode(token);
        const decodedToken = DecodedZedToken.decode(Buffer.from(decodedBytes, "utf8")).v1;
        if (!decodedToken) {
            return undefined;
        }

        // for MySQL:
        //  - https://github.com/authzed/spicedb/blob/main/internal/datastore/mysql/revisions.go#L182C1-L189C2
        //  - https://github.com/authzed/spicedb/blob/786555c24af98abfe3f832c94dbae5ca518dcf50/pkg/datastore/revision/decimal.go#L53
        const timestamp = parseInt(decodedToken.revision, 10);
        return { token, timestamp };
    }
}
