/**
 * MCP server factory.
 *
 * Builds a Server instance, registers ListTools and CallTool handlers,
 * and returns it. Transport-agnostic — the caller binds it to stdio or HTTP.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { allTools } from "./tools/index.js";
import { scopeForTool } from "./scopes.js";

const SERVER_NAME = process.env.MCP_SERVER_NAME ?? "proprietio-mcp";
const SERVER_VERSION = process.env.MCP_SERVER_VERSION ?? "0.1.0";

export function createServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      // User-friendly display title (Anthropic Connectors directory requires it).
      // Emitted both top-level and inside annotations.title for maximum client
      // compatibility — the frozen contract is `name`, never `title`.
      title: t.title,
      description: t.description,
      // Emit standards-compliant JSON Schema (draft-07), NOT OpenAPI 3.0.
      // The `openApi3` target serialises numeric bounds the OpenAPI/draft-04 way
      // — e.g. `exclusiveMinimum: true` (a boolean) alongside `minimum`. That is
      // INVALID under JSON Schema draft-07/2020-12, which MCP clients validate
      // against. Claude tolerated it; ChatGPT's Apps SDK rejects the whole tool
      // ("Invalid MCP tool schema for tool 'proprietio_get_general_ledger'").
      // The default target emits `exclusiveMinimum: 0` (numeric) — valid. This
      // changes only how the SAME Zod schema is serialised; no tool name or
      // input field is touched (frozen-contract safe).
      inputSchema: zodToJsonSchema(t.inputSchema, {
        $refStrategy: "none",
      }) as Record<string, unknown>,
      // Behaviour hints — read by the Anthropic Connectors directory / ChatGPT
      // Apps SDK / Claude for safety gating. Additive only; never affects the
      // frozen tool name or input schema. All four hints are emitted EXPLICITLY
      // as booleans on every tool — never omitted/undefined/null — because the
      // OpenAI Apps directory (and Anthropic review) reject a tool whose hints
      // are absent (an omitted hint reads as "unknown", not a safe default).
      // That omission — `idempotentHint` missing on the read tools — is exactly
      // what bounced the submission. Listing the keys by hand here (rather than
      // spreading) keeps the wire shape explicit even if the type ever loosens.
      // `title` is folded in too so clients that read annotations.title (rather
      // than the top-level field) still get the friendly label.
      annotations: {
        title: t.title,
        readOnlyHint: t.annotations.readOnlyHint,
        destructiveHint: t.annotations.destructiveHint,
        idempotentHint: t.annotations.idempotentHint,
        openWorldHint: t.annotations.openWorldHint,
      },
    })),
  }));

  // Call tool
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = allTools.find((t) => t.name === req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      };
    }

    try {
      const parsed = tool.inputSchema.safeParse(req.params.arguments ?? {});
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Invalid arguments for ${tool.name}:\n${parsed.error.message}`,
            },
          ],
        };
      }
      const result = await tool.handler(parsed.data);
      // Emit machine-readable structuredContent alongside the text block so
      // clients (ChatGPT Apps SDK especially) parse fields deterministically
      // instead of re-reading the JSON prose. Only attach it for plain object
      // results — the spec requires structuredContent to be an object.
      const structured =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : undefined;
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
        ...(structured ? { structuredContent: structured } : {}),
      };
    } catch (err) {
      let msg = err instanceof Error ? err.message : String(err);
      // Enrich a scope rejection with the exact scope this tool needs, so Claude
      // can tell the user which consent to grant. rentaly is the enforcement
      // boundary (it 403s insufficient_scope); we only name the missing scope.
      const scope = scopeForTool(tool.name);
      if (scope && /forbidden|insufficient_scope|missing the required scope/i.test(msg)) {
        msg += ` (this tool requires the "${scope}" scope — re-authorize the connector to grant it)`;
      }
      return {
        isError: true,
        content: [{ type: "text", text: `Error in ${tool.name}: ${msg}` }],
      };
    }
  });

  return server;
}
