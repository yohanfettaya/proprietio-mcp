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
  return {
    issuer: process.env.OAUTH_ISSUER ?? "https://auth.proprietio.com",
    authorizationEndpoint:
      process.env.OAUTH_AUTHORIZATION_ENDPOINT ??
      "https://auth.proprietio.com/oauth/authorize",
    tokenEndpoint:
      process.env.OAUTH_TOKEN_ENDPOINT ?? "https://auth.proprietio.com/oauth/token",
    revocationEndpoint:
      process.env.OAUTH_REVOCATION_ENDPOINT ?? "https://auth.proprietio.com/oauth/revoke",
    demoBearerToken: process.env.DEMO_BEARER_TOKEN || undefined,
    resourceUrl:
      process.env.MCP_RESOURCE_URL ?? "https://mcp.proprietio.com/mcp",
  };
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

/**
 * Bearer-token middleware.
 *
 * - In demo mode (DEMO_BEARER_TOKEN set), accepts that exact token.
 * - In production mode, callers should swap this for a real introspection call.
 * - When no token is configured, requests pass through (open demo).
 */
export function bearerAuth(cfg: AuthConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!cfg.demoBearerToken) return next(); // open mode
    const header = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || match[1] !== cfg.demoBearerToken) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="proprietio-mcp", resource_metadata="${cfg.resourceUrl}/.well-known/oauth-protected-resource"`,
      );
      res.status(401).json({ error: "invalid_token" });
      return;
    }
    next();
  };
}
