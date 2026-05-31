/**
 * Per-request auth context.
 *
 * The MCP SDK's CallTool handler is stateless and has no access to the Express
 * request, yet each rentaly call must carry the *end user's* OAuth bearer token
 * (so rentaly resolves token → organizationId and enforces per-tool scope).
 *
 * AsyncLocalStorage bridges that gap: the HTTP layer (src/index.ts) opens a
 * context around `transport.handleRequest(...)`, stashing the forwarded bearer;
 * the rentaly client (src/api/rentaly-client.ts) reads it back out at call time.
 * No token is ever stored — it lives only for the duration of the request.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestAuth {
  /** The raw bearer token forwarded by the MCP client (end-user OAuth token). */
  bearerToken?: string;
}

const storage = new AsyncLocalStorage<RequestAuth>();

/** Run `fn` with the given auth bound to the async context. */
export function runWithRequestAuth<T>(auth: RequestAuth, fn: () => T): T {
  return storage.run(auth, fn);
}

/** The bearer token for the in-flight request, or undefined outside a context. */
export function getRequestBearer(): string | undefined {
  return storage.getStore()?.bearerToken;
}
