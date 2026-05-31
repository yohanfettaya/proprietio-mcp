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
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema, {
        target: "openApi3",
        $refStrategy: "none",
      }) as Record<string, unknown>,
      // Behaviour hints — read by ChatGPT Apps SDK / Claude for safety gating.
      // Additive only; never affects the frozen tool name or input schema.
      ...(t.annotations ? { annotations: t.annotations } : {}),
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
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Error in ${tool.name}: ${msg}` }],
      };
    }
  });

  return server;
}
