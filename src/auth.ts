/**
 * OAuth 2.0 helpers.
 *
 * For demo mode we accept a configured bearer token. In production this is
 * replaced with introspection against the Proprietio auth server.
 *
 * Exposes:
 *   - /.well-known/oauth-authorization-server  (RFC 8414)
 *   - /.well-known/oauth-protected-resource    (RFC 9728)
 * The MCP spec uses these to discover the auth flow for remote MCP servers.
 */
import type { Request, Response, NextFunction } from "express";

export interface AuthConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  revocationEndpoint: string;
  demoBearerToken: string | undefined;
  resourceUrl: string;
}

export function loadAuthConfig(): AuthConfig {
  // The Authorization Server IS rentaly (api.proprietio.com) — see rentaly
  // server/lib/oauthConfig.js. Discovery is RFC 8414 at the issuer root, so the
  // endpoint paths below are advisory; Claude resolves them from the issuer's
  // /.well-known/oauth-authorization-server. Defaults kept in lockstep anyway.
  const issuer = process.env.OAUTH_ISSUER ?? "https://api.proprietio.com";
  return {
    issuer,
    authorizationEndpoint:
      process.env.OAUTH_AUTHORIZATION_ENDPOINT ?? `${issuer}/oauth/authorize`,
    tokenEndpoint:
      process.env.OAUTH_TOKEN_ENDPOINT ?? `${issuer}/oauth/token`,
    revocationEndpoint:
      process.env.OAUTH_REVOCATION_ENDPOINT ?? `${issuer}/oauth/revoke`,
    demoBearerToken: process.env.DEMO_BEARER_TOKEN || undefined,
    resourceUrl:
      process.env.MCP_RESOURCE_URL ?? "https://mcp.proprietio.com/mcp",
  };
}

/** True when the connector runs in real OAuth mode (per-user bearer tokens). */
export function isOAuthEnabled(): boolean {
  return process.env.MCP_OAUTH_ENABLED === "true";
}

export function authorizationServerMetadata(cfg: AuthConfig) {
  return {
    issuer: cfg.issuer,
    authorization_endpoint: cfg.authorizationEndpoint,
    token_endpoint: cfg.tokenEndpoint,
    revocation_endpoint: cfg.revocationEndpoint,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    scopes_supported: [
      "properties:read",
      "tenants:read",
      "accounting:read",
      "maintenance:read",
      "maintenance:write",
      "communications:write",
    ],
  };
}

export function protectedResourceMetadata(cfg: AuthConfig) {
  return {
    resource: cfg.resourceUrl,
    authorization_servers: [cfg.issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: authorizationServerMetadata(cfg).scopes_supported,
  };
}

/** Standard challenge header pointing Claude at the protected-resource metadata. */
function challenge(res: Response, cfg: AuthConfig): void {
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="proprietio-mcp", resource_metadata="${cfg.resourceUrl}/.well-known/oauth-protected-resource"`,
  );
}

/**
 * Bearer-token middleware. Three modes, in priority order:
 *
 *   1. OAuth mode (MCP_OAUTH_ENABLED=true) — require *a* bearer and forward it
 *      verbatim to rentaly, which validates it (token → org) and enforces scope.
 *      We don't introspect here; presence + downstream validation is the model.
 *      Absent/malformed → 401 + WWW-Authenticate so Claude starts the OAuth flow.
 *   2. Demo mode (DEMO_BEARER_TOKEN set) — accept that one static token.
 *   3. Open mode (neither set) — pass through (local/dev demo).
 */
export function bearerAuth(cfg: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);

    if (isOAuthEnabled()) {
      if (!match) {
        challenge(res, cfg);
        res.status(401).json({ error: "invalid_token" });
        return;
      }
      return next(); // token forwarded downstream via request-auth context
    }

    if (!cfg.demoBearerToken) return next(); // open mode

    if (!match || match[1] !== cfg.demoBearerToken) {
      challenge(res, cfg);
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    next();
  };
}

/** Extract the raw bearer token from a request, or undefined if absent. */
export function extractBearer(req: Request): string | undefined {
  const match = /^Bearer\s+(.+)$/i.exec(req.header("authorization") ?? "");
  return match ? match[1] : undefined;
}
