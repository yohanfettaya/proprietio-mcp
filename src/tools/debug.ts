/**
 * Debug tools (1) — not part of the frozen 18-tool public contract.
 *
 * These tools are additive; they expose internal state for diagnosis and
 * never write anything. They may be removed once the platform is stable.
 */
import { z } from "zod";
import { rentaly, isLiveBackend } from "../api/rentaly-client.js";
import type { ToolDefinition } from "./index.js";

export const debugTools: ToolDefinition[] = [
  {
    name: "proprietio_whoami",
    title: "Who Am I (Debug)",
    description:
      "Returns the organization, user, auth method, and scopes resolved from the current credentials. " +
      "Use this to diagnose mis-scoping issues (e.g. all queries return count:0 because the token " +
      "resolves to the wrong organization).",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    annotationRationale:
      "Reads the resolved principal from the current credentials with no state mutation. " +
      "Idempotent and closed-world.",
    handler: async () => {
      if (isLiveBackend()) return rentaly.whoami();
      return {
        organization_id: "mock-org",
        organization: { id: "mock-org", name: "Mock Org", slug: "mock" },
        user_id: null,
        auth_via: "mock",
        key_label: "mock",
        scopes: null,
      };
    },
  },
];
