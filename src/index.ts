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
} from "./auth.js";
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

  // --- OAuth 2.0 discovery (only when a real OAuth server is configured) ---
  if (process.env.MCP_OAUTH_ENABLED === "true") {
    app.get("/.well-known/oauth-authorization-server", (_req, res) => {
      res.json(authorizationServerMetadata(cfg));
    });
    app.get("/.well-known/oauth-protected-resource", (_req, res) => {
      res.json(protectedResourceMetadata(cfg));
    });
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
      await transport.handleRequest(req, res, req.body);
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
