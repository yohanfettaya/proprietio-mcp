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
 * MCP tool annotations (per the MCP spec / Anthropic Connectors directory
 * submission / ChatGPT Apps SDK safety review). All additive — they describe a
 * tool's behaviour to the client without touching the frozen tool name or input
 * schema:
 *   - readOnlyHint:    the tool does not mutate state.
 *   - destructiveHint: the tool may overwrite/destroy existing state, or its
 *                      effect reaches a real human (e.g. sends a message). Only
 *                      meaningful when readOnlyHint is false.
 *   - idempotentHint:  repeating the same call has no additional effect.
 *   - openWorldHint:   the tool reaches an open/unbounded external world (e.g.
 *                      browses arbitrary web). FALSE for every Proprietio tool —
 *                      we only ever touch the one configured Proprietio backend.
 *
 * `title` lives on the ToolDefinition (below) as the single source of truth and
 * is propagated into both the top-level `tool.title` and `annotations.title` by
 * the ListTools handler, so it is intentionally absent here.
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
  /**
   * Human-friendly display title (e.g. "Search Properties"), required by the
   * Anthropic Connectors directory submission. The frozen public contract is
   * the tool `name`; `title` is presentation only and safe to edit.
   */
  title: string;
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
