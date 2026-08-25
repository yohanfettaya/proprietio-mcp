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
import { debugTools } from "./debug.js";
import { operationsTools } from "./operations.js";

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
 *                      dispatches an external email). FALSE for every Proprietio
 *                      tool EXCEPT proprietio_send_message, which delivers a
 *                      message to a recipient's own inbox outside our backend.
 *
 * `title` lives on the ToolDefinition (below) as the single source of truth and
 * is propagated into both the top-level `tool.title` and `annotations.title` by
 * the ListTools handler, so it is intentionally absent here.
 */
/**
 * All four behaviour hints are REQUIRED and must be an explicit boolean — never
 * undefined/null. The OpenAI Apps directory (and the Anthropic Connectors
 * review) reject any tool whose hints are absent: an omitted hint reads as
 * "unknown", NOT as a safe default. Making these non-optional turns "a tool
 * forgot a hint" into a TypeScript compile error instead of a silent directory
 * rejection — which is exactly the regression that bounced this submission
 * (`idempotentHint` was missing on the read tools).
 */
export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
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
  /** Required: every tool must declare all four behaviour hints explicitly. */
  annotations: ToolAnnotations;
  /**
   * Short, human-readable justification for the hint values above, written to
   * match the handler's actual behaviour. Surfaced in the docs / PR annotation
   * table so reviewers (OpenAI, Anthropic, and us) can verify behaviour matches
   * the hints. Optional on the MCP wire response — the ListTools handler does
   * not emit it by default — so it is documentation, never part of the frozen
   * contract.
   */
  annotationRationale: string;
  handler: (args: ZodInfer<T>) => unknown | Promise<unknown>;
}

export const allTools: ToolDefinition[] = [
  ...operationsTools,
  ...propertyTools,
  ...accountingTools,
  ...maintenanceTools,
  ...commsTools,
  ...debugTools,
];

if (allTools.length !== 23) {
  // Self-check at module load: the spec promises 22 public tools + 1 debug tool.
  // Throwing here makes mismatches obvious in CI.
  throw new Error(`Expected 23 tools, registered ${allTools.length}`);
}
