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

export interface ToolDefinition<T extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: T;
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
