#!/usr/bin/env node
/**
 * Proprietio MCP — server entrypoint.
 *
 * Two modes:
 *   - `node dist/index.js stdio`  → stdio transport (Claude Desktop local config)
 *   - `node dist/index.js`        → HTTP transport on PORT (default 3030)
 *                                   for Claude.ai / Claude Code / remote MCP
 *
 * The HTTP server also exposes OAuth 2.0 metadata at the well-known paths
 * so Claude can discover the auth flow.
 */
import express from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import {
  loadAuthConfig,
  authorizationServerMetadata,
  protectedResourceMetadata,
  bearerAuth,
  extractBearer,
} from "./auth.js";
import { runWithRequestAuth } from "./context.js";
import { allTools } from "./tools/index.js";

const mode = process.argv[2] ?? "http";

async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[proprietio-mcp] stdio mode ready, ${allTools.length} tools registered`,
  );
}

async function startHttp() {
  const port = parseInt(process.env.PORT ?? "3030", 10);
  const cfg = loadAuthConfig();
  const app = express();

  // --- CORS ---
  // Browser-side MCP clients (notably ChatGPT's Developer-mode connector) drive
  // the discovery + /mcp + OAuth-challenge calls directly from their web origin
  // (e.g. https://chatgpt.com), so without CORS headers the browser blocks the
  // response and the connection fails. These endpoints authenticate by bearer /
  // PKCE — never a cookie — so a permissive, credential-less policy is safe. We
  // reflect the request Origin (not "*") and, crucially, EXPOSE WWW-Authenticate
  // so the client can read the 401 challenge that bootstraps the OAuth flow.
  // (Claude worked without this because it runs the flow server-side.)
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    const reqHeaders = req.headers["access-control-request-headers"];
    res.setHeader(
      "Access-Control-Allow-Headers",
      typeof reqHeaders === "string"
        ? reqHeaders
        : "Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version",
    );
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: "2mb" }));

  // --- Health & meta ---
  app.get("/", (_req, res) => {
    res.json({
      name: "proprietio-mcp",
      status: "ok",
      tools: allTools.length,
      docs: "https://developers.proprietio.com/mcp",
      mcp_endpoint: "/mcp",
    });
  });

  app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

  // --- OpenAI App Directory domain-verification challenge ---
  // OpenAI proves we control mcp.proprietio.com by fetching this fixed path and
  // checking it returns this exact token as raw text. It is a public proof of
  // ownership (not a secret) and MUST be: unauthenticated, no redirect, HTTP 200,
  // Content-Type text/plain, body = the token and nothing else. Keep it mounted
  // ABOVE the bearer-protected /mcp routes so it stays open.
  app.get("/.well-known/openai-apps-challenge", (_req, res) => {
    res.type("text/plain").send("5ci1eYSh12rrsB__nt90KEhQ9gLFmREWo27he9vkQhc");
  });

  // --- OAuth 2.0 discovery (only when a real OAuth server is configured) ---
  if (process.env.MCP_OAUTH_ENABLED === "true") {
    app.get("/.well-known/oauth-authorization-server", (_req, res) => {
      res.json(authorizationServerMetadata(cfg));
    });
    // Protected-resource metadata (RFC 9728). Serve it at EVERY path a client may
    // probe, because they disagree on where to look for a resource with a path
    // (`/mcp`):
    //   - root  `/.well-known/oauth-protected-resource`            (Claude's default)
    //   - our own `WWW-Authenticate` advertises the resource-suffixed form
    //     `/mcp/.well-known/oauth-protected-resource`              (ChatGPT follows it
    //     verbatim — a 404 here is what broke the ChatGPT connector)
    //   - RFC 9728 canonical, well-known inserted before the path
    //     `/.well-known/oauth-protected-resource/mcp`
    const protectedResource = (_req: express.Request, res: express.Response) => {
      res.json(protectedResourceMetadata(cfg));
    };
    app.get("/.well-known/oauth-protected-resource", protectedResource);
    app.get("/mcp/.well-known/oauth-protected-resource", protectedResource);
    app.get("/.well-known/oauth-protected-resource/mcp", protectedResource);
  }

  // --- MCP endpoint (Streamable HTTP) ---
  // Stateless mode — one Server per request. Fine for our tools (no in-mem session).
  const mcpHandler = async (
    req: express.Request,
    res: express.Response,
  ): Promise<void> => {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        transport.close().catch(() => undefined);
        server.close().catch(() => undefined);
      });
      await server.connect(transport);
      // Bind the end-user's bearer to the async context for the lifetime of this
      // request so the rentaly client forwards it (token → org + scope at rentaly).
      // The bearer is never stored beyond this scope.
      const bearerToken = extractBearer(req);
      await runWithRequestAuth({ bearerToken }, () =>
        transport.handleRequest(req, res, req.body),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: `Internal error: ${msg}` },
        });
      }
    }
  };

  // Protect /mcp with bearer middleware
  app.post("/mcp", bearerAuth(cfg), mcpHandler);
  app.get("/mcp", bearerAuth(cfg), mcpHandler);
  app.delete("/mcp", bearerAuth(cfg), mcpHandler);

  app.listen(port, () => {
    console.log(`[proprietio-mcp] HTTP mode listening on :${port}`);
    console.log(`[proprietio-mcp] ${allTools.length} tools registered`);
    console.log(`[proprietio-mcp] try: curl http://localhost:${port}/`);
  });
}

if (mode === "stdio") {
  startStdio().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  startHttp().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
