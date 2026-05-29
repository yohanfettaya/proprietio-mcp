/**
 * Shared types and Zod input schemas for Proprietio MCP tools.
 * Zod schemas double as JSON Schema for the MCP tool registration.
 */
import { z } from "zod";

// ---------- Common ----------
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const Money = z.number().nonnegative();
export const Pct = z.number().min(0).max(100);

// ---------- Domain entities (output shapes) ----------
export interface Property {
  property_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  unit_count: number;
  year_built: number;
  acquired_date: string;
  owner: string;
  current_value: number;
}

export interface Unit {
  unit_id: string;
  property_id: string;
  unit_number: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  market_rent: number;
  current_rent: number;
  occupied: boolean;
  current_lease_id: string | null;
}

export interface Lease {
  lease_id: string;
  unit_id: string;
  property_id: string;
  resident_ids: string[];
  start_date: string;
  end_date: string;
  monthly_rent: number;
  security_deposit: number;
  status: "active" | "expired" | "future";
}

export interface Resident {
  resident_id: string;
  full_name: string;
  email: string;
  phone: string;
  unit_id: string;
  property_id: string;
  balance_due: number;
}

export interface WorkOrder {
  work_order_id: string;
  property_id: string;
  unit_id: string | null;
  category: string;
  priority: "low" | "medium" | "high" | "emergency";
  status: "open" | "assigned" | "in_progress" | "completed" | "cancelled";
  description: string;
  created_at: string;
  updated_at: string;
  assigned_vendor_id: string | null;
  resolution_notes: string | null;
  days_open: number;
}

export interface Vendor {
  vendor_id: string;
  name: string;
  trade: string;
  phone: string;
  email: string;
  rating: number;
  approved: boolean;
}

// ---------- Tool input schemas ----------

// Properties & Leasing
export const SearchPropertiesInput = z.object({
  city: z.string().optional().describe("City filter, e.g. 'Austin'"),
  state: z.string().length(2).optional().describe("Two-letter state code, e.g. 'TX'"),
  owner: z.string().optional().describe("Owner name filter (partial match)"),
  min_units: z.number().int().nonnegative().optional(),
  max_units: z.number().int().nonnegative().optional(),
});

export const GetPropertyInput = z.object({
  property_id: z.string().describe("Proprietio property identifier, e.g. 'prop_001'"),
});

export const ListUnitsInput = z.object({
  property_id: z.string(),
  occupied_only: z.boolean().optional().default(false),
});

export const GetLeaseInput = z.object({
  lease_id: z.string(),
});

export const ListResidentsInput = z.object({
  property_id: z.string().optional(),
  unit_id: z.string().optional(),
}).refine(
  (v) => v.property_id || v.unit_id,
  "Provide property_id or unit_id",
);

// Accounting
export const GetRentRollInput = z.object({
  scope_id: z.string().describe("Property or portfolio identifier"),
  as_of_date: IsoDate.optional(),
});

export const GetDelinquencyInput = z.object({
  scope_id: z.string(),
  as_of_date: IsoDate.optional(),
  group_by: z.enum(["property", "unit", "resident"]).optional().default("property"),
});

export const GetIncomeStatementInput = z.object({
  scope_id: z.string(),
  period_start: IsoDate,
  period_end: IsoDate,
});

export const GetBalanceSheetInput = z.object({
  scope_id: z.string(),
  as_of_date: IsoDate.optional(),
});

export const GetGeneralLedgerInput = z.object({
  scope_id: z.string(),
  account: z.string().optional().describe("GL account filter, e.g. '4000-Rental Income'"),
  period_start: IsoDate,
  period_end: IsoDate,
  limit: z.number().int().positive().max(500).optional().default(100),
});

export const GetNoiInput = z.object({
  scope_id: z.string(),
  period_start: IsoDate,
  period_end: IsoDate,
});

// Maintenance
export const SearchWorkOrdersInput = z.object({
  property_id: z.string().optional(),
  status: z.enum(["open", "assigned", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "emergency"]).optional(),
  min_days_open: z.number().int().nonnegative().optional(),
  category: z.string().optional(),
});

export const GetWorkOrderInput = z.object({
  work_order_id: z.string(),
});

export const CreateWorkOrderInput = z.object({
  property_id: z.string(),
  unit_id: z.string().optional(),
  category: z.string().describe("e.g. 'plumbing', 'hvac', 'electrical', 'general'"),
  priority: z.enum(["low", "medium", "high", "emergency"]).default("medium"),
  description: z.string().min(5),
  assigned_vendor_id: z.string().optional(),
});

export const UpdateWorkOrderInput = z.object({
  work_order_id: z.string(),
  status: z.enum(["open", "assigned", "in_progress", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "emergency"]).optional(),
  assigned_vendor_id: z.string().optional(),
  notes: z.string().optional(),
});

export const CloseWorkOrderInput = z.object({
  work_order_id: z.string(),
  resolution_notes: z.string().min(5),
});

export const ListVendorsInput = z.object({
  trade: z.string().optional(),
  approved_only: z.boolean().optional().default(true),
});

// Comms
export const SendMessageInput = z.object({
  to_resident_id: z.string().optional(),
  to_vendor_id: z.string().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
}).refine(
  (v) => v.to_resident_id || v.to_vendor_id,
  "Provide to_resident_id or to_vendor_id",
);
