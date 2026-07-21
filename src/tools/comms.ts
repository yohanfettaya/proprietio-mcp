/**
 * Communications tools (1).
 */
import { SendMessageInput } from "../types.js";
import { residents, vendors } from "../data/mock.js";
import { rentaly, isLiveBackend } from "../api/rentaly-client.js";
import type { ToolDefinition } from "./index.js";

export const commsTools: ToolDefinition[] = [
  {
    name: "proprietio_send_message",
    title: "Send Tenant or Vendor Message",
    description:
      "Send a message through Proprietio's messaging system to exactly one recipient: either one resident or one vendor. WRITE action; requires the communications:write scope.",
    inputSchema: SendMessageInput,
    // destructiveHint: true — the message reaches a real human and cannot be
    // un-sent. openWorldHint: true — delivery dispatches an external email to the
    // tenant's or vendor's own inbox via the configured mail provider, landing
    // outside our host environment. Per the MCP spec that is a true open-world
    // interaction. This is the ONLY tool with openWorldHint=true; the other 17
    // only ever touch the configured Proprietio backend.
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    annotationRationale:
      "Write with a real-world side effect: delivers a message to a resident or vendor, so readOnlyHint=false. destructiveHint=true — a sent message reaches a human and cannot be un-sent (irreversible effect), even though no stored record is overwritten or deleted. Non-idempotent (idempotentHint=false): each call sends another message. openWorldHint=true — delivery dispatches an external email to the recipient's own inbox via the configured mail provider, reaching outside our host environment.",
    handler: (args) => {
      if (isLiveBackend()) return rentaly.sendMessage(args);
      let recipient: { id: string; name: string; channel: string } | null = null;
      if (args.to_resident_id) {
        const r = residents.find(x => x.resident_id === args.to_resident_id);
        if (!r) throw new Error(`Resident not found: ${args.to_resident_id}`);
        recipient = { id: r.resident_id, name: r.full_name, channel: r.email };
      } else if (args.to_vendor_id) {
        const v = vendors.find(x => x.vendor_id === args.to_vendor_id);
        if (!v) throw new Error(`Vendor not found: ${args.to_vendor_id}`);
        recipient = { id: v.vendor_id, name: v.name, channel: v.email };
      }
      if (!recipient) throw new Error("No recipient resolved");

      const message_id = `msg_${Date.now().toString(36)}`;
      return {
        message_id,
        recipient,
        subject: args.subject,
        sent_at: new Date().toISOString(),
        status: "queued",
        note: "Demo server: message accepted but not actually delivered.",
      };
    },
  },
];
