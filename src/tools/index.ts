/**
 * Registry of all Proprietio MCP tools.
 *
 * Each ToolDefinition wires a Zod input schema to a handler. The MCP server
 * walks this list to register tools at startup.
 */
import type { ZodTypeAny, infer as ZodInfer } from "zod";
import { propertyTools } from "./properties.js";
import { accountingTools } from "./accounting.js";
import { maintenanceTools } from "./maintenance.js";
import { commsTools } from "./comms.js";

/**
 * MCP tool annotations (per the MCP spec / ChatGPT Apps SDK safety review).
 * All optional and additive — they describe a tool's behaviour to the client
 * without touching the frozen tool name or input schema:
 *   - readOnlyHint:    the tool does not mutate state.
 *   - destructiveHint: the tool may overwrite/destroy existing state (only
 *                      meaningful when readOnlyHint is false).
 *   - idempotentHint:  repeating the same call has no additional effect.
 *   - openWorldHint:   the tool reaches the outside world (e.g. messages a
 *                      real person), not just our own datastore.
 */
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition<T extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: T;
  annotations?: ToolAnnotations;
  handler: (args: ZodInfer<T>) => unknown | Promise<unknown>;
}

export const allTools: ToolDefinition[] = [
  ...propertyTools,
  ...accountingTools,
  ...maintenanceTools,
  ...commsTools,
];

if (allTools.length !== 18) {
  // Self-check at module load: the spec promises 18 tools.
  // Throwing here makes mismatches obvious in CI.
  throw new Error(`Expected 18 tools, registered ${allTools.length}`);
}
