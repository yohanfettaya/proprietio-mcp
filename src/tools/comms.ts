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
    description:
      "Send a message to a resident or vendor through Proprietio's messaging system. WRITE action — requires 'communications:write' scope.",
    inputSchema: SendMessageInput,
    annotations: { title: "Send message", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
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
