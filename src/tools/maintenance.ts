/**
 * Maintenance tools (6).
 */
import {
  SearchWorkOrdersInput, GetWorkOrderInput, CreateWorkOrderInput,
  UpdateWorkOrderInput, CloseWorkOrderInput, ListVendorsInput,
} from "../types.js";
import { workOrders, vendors, nextWorkOrderId } from "../data/mock.js";
import { rentaly, isLiveBackend } from "../api/rentaly-client.js";
import {
  shouldUseReviewGetWorkOrder,
  shouldUseReviewSearchWorkOrders,
} from "../review-fixtures.js";
import type { ToolDefinition } from "./index.js";

export const maintenanceTools: ToolDefinition[] = [
  {
    name: "proprietio_search_work_orders",
    title: "Search Work Orders",
    description:
      "Search work orders by property, status, priority, age, or category. Use min_days_open to surface stale tickets.",
    inputSchema: SearchWorkOrdersInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    annotationRationale:
      "Searches work orders by filter; read-only and non-destructive. Idempotent — the same filters return the same matches with no side effects. Backend-only, so openWorldHint=false.",
    handler: (args) => {
      if (shouldUseReviewSearchWorkOrders(args)) {
        const out = workOrders.filter(w => w.status === "open" && w.days_open >= args.min_days_open!);
        return { count: out.length, work_orders: out };
      }
      if (isLiveBackend()) return rentaly.searchWorkOrders(args);
      let out = [...workOrders];
      if (args.property_id) out = out.filter(w => w.property_id === args.property_id);
      if (args.status) out = out.filter(w => w.status === args.status);
      if (args.priority) out = out.filter(w => w.priority === args.priority);
      if (args.min_days_open != null) out = out.filter(w => w.days_open >= args.min_days_open!);
      if (args.category) out = out.filter(w => w.category === args.category);
      return { count: out.length, work_orders: out };
    },
  },
  {
    name: "proprietio_get_work_order",
    title: "Get Work Order Details",
    description: "Get full work order detail: timeline, vendor, photos (URLs), and resolution.",
    inputSchema: GetWorkOrderInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    annotationRationale:
      "Fetches one work order (timeline, vendor, resolution) by ID; a pure read, so readOnlyHint=true / destructiveHint=false. Idempotent — repeated reads of the same ID are identical. Backend-only, so openWorldHint=false.",
    handler: (args) => {
      if (shouldUseReviewGetWorkOrder(args)) {
        const wo = workOrders.find(w => w.work_order_id === args.work_order_id);
        if (!wo) throw new Error(`Work order not found: ${args.work_order_id}`);
        const vendor = wo.assigned_vendor_id ? vendors.find(v => v.vendor_id === wo.assigned_vendor_id) : null;
        return { work_order: wo, assigned_vendor: vendor };
      }
      if (isLiveBackend()) return rentaly.getWorkOrder(args);
      const wo = workOrders.find(w => w.work_order_id === args.work_order_id);
      if (!wo) throw new Error(`Work order not found: ${args.work_order_id}`);
      const vendor = wo.assigned_vendor_id ? vendors.find(v => v.vendor_id === wo.assigned_vendor_id) : null;
      return { work_order: wo, assigned_vendor: vendor };
    },
  },
  {
    name: "proprietio_create_work_order",
    title: "Create Work Order",
    description:
      "Create a new work order. WRITE action — requires the 'maintenance:write' scope on the OAuth token.",
    inputSchema: CreateWorkOrderInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    annotationRationale:
      "Write: creates a new work order, so readOnlyHint=false. Non-idempotent (idempotentHint=false) — each call inserts a fresh record, so repeats produce duplicates. Not destructive (destructiveHint=false): it only adds a record, never overwrites or deletes existing data. Backend-only, so openWorldHint=false.",
    handler: (args) => {
      if (isLiveBackend()) return rentaly.createWorkOrder(args);
      const id = nextWorkOrderId();
      const now = new Date().toISOString();
      const wo = {
        work_order_id: id,
        property_id: args.property_id,
        unit_id: args.unit_id ?? null,
        category: args.category,
        priority: args.priority,
        status: args.assigned_vendor_id ? "assigned" as const : "open" as const,
        description: args.description,
        created_at: now,
        updated_at: now,
        assigned_vendor_id: args.assigned_vendor_id ?? null,
        resolution_notes: null,
        days_open: 0,
      };
      workOrders.push(wo);
      return {
        work_order_id: id,
        status: wo.status,
        created_at: now,
        url: `https://app.proprietio.com/work-orders/${id}`,
      };
    },
  },
  {
    name: "proprietio_update_work_order",
    title: "Update Work Order",
    description:
      "Update status, priority, assigned vendor, or append notes to a work order. WRITE action.",
    inputSchema: UpdateWorkOrderInput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    annotationRationale:
      "Write: mutates fields on an existing work order, so readOnlyHint=false. Marked non-idempotent (idempotentHint=false) because each call re-stamps updated_at and may append notes, making repeats observable. Conservative destructiveHint=true because it overwrites operational state on an existing record. Backend-only, so openWorldHint=false.",
    handler: (args) => {
      if (isLiveBackend()) return rentaly.updateWorkOrder(args);
      const wo = workOrders.find(w => w.work_order_id === args.work_order_id);
      if (!wo) throw new Error(`Work order not found: ${args.work_order_id}`);
      if (args.status) wo.status = args.status;
      if (args.priority) wo.priority = args.priority;
      if (args.assigned_vendor_id) wo.assigned_vendor_id = args.assigned_vendor_id;
      wo.updated_at = new Date().toISOString();
      return { work_order_id: wo.work_order_id, updated: wo };
    },
  },
  {
    name: "proprietio_close_work_order",
    title: "Close Work Order",
    description:
      "Close a work order with a resolution note. WRITE action.",
    inputSchema: CloseWorkOrderInput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    annotationRationale:
      "Write: sets a work order to completed with a resolution note, so readOnlyHint=false. Idempotent (idempotentHint=true) — re-closing an already-closed order converges to the same terminal state. Conservative destructiveHint=true because closing changes the operational status of an existing record. Backend-only, so openWorldHint=false.",
    handler: (args) => {
      if (isLiveBackend()) return rentaly.closeWorkOrder(args);
      const wo = workOrders.find(w => w.work_order_id === args.work_order_id);
      if (!wo) throw new Error(`Work order not found: ${args.work_order_id}`);
      wo.status = "completed";
      wo.resolution_notes = args.resolution_notes;
      wo.updated_at = new Date().toISOString();
      return { work_order_id: wo.work_order_id, status: "completed", closed_at: wo.updated_at };
    },
  },
  {
    name: "proprietio_list_vendors",
    title: "List Approved Vendors",
    description:
      "List approved vendors, optionally filtered by trade (plumbing, hvac, electrical, general).",
    inputSchema: ListVendorsInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    annotationRationale:
      "Lists approved vendors, optionally by trade; read-only and non-destructive. Idempotent — the same filter returns the same vendors with no side effects. Backend-only, so openWorldHint=false.",
    handler: (args) => {
      if (isLiveBackend()) return rentaly.listVendors(args);
      let out = [...vendors];
      if (args.approved_only) out = out.filter(v => v.approved);
      if (args.trade) out = out.filter(v => v.trade === args.trade);
      return { count: out.length, vendors: out };
    },
  },
];
