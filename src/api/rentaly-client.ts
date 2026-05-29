/**
 * Rentaly REST client — THE single conversion point between the rentaly
 * `/api/v1/*` backend and the MCP tool contract (see proprietio-mcp/src/types.ts
 * and rentaly docs/mcp-migration-audit.md §6, decision locked 2026-05-29).
 *
 * Everything rentaly-specific lives here and nowhere else:
 *   1. HTTP + auth — `X-Api-Key: pk_live_…` against RENTALY_API_BASE_URL.
 *   2. Pagination — rentaly's offset envelope `{ data, pagination:{ total, limit,
 *      offset, hasMore } }` is converted to the MCP shape here. The frozen tool
 *      input schemas expose no cursor parameter, so list methods follow the
 *      cursor (offset) internally and return the full set as `{ count, … }`.
 *   3. Money — rentaly sends integer **cents** on the wire (single exception:
 *      `Property.current_value`, already dollars). This client divides by 100 so
 *      handlers/Claude always see dollars, matching the output interfaces.
 *   4. Errors — HTTP status → a clear Error the MCP server surfaces to Claude.
 *
 * Handlers stay thin: when BACKEND_MODE=live they call a method here; otherwise
 * they keep returning their mock fixtures (the demo path is left intact).
 */
import { z } from "zod";
import * as T from "../types.js";

/** True when the server should hit the real rentaly API instead of mock data. */
export function isLiveBackend(): boolean {
  return (process.env.BACKEND_MODE ?? "mock").toLowerCase() === "live";
}

interface RentalyConfig {
  baseUrl: string;
  apiKey: string;
}

function config(): RentalyConfig {
  const baseUrl = process.env.RENTALY_API_BASE_URL;
  const apiKey = process.env.RENTALY_API_KEY;
  if (!baseUrl) {
    throw new Error(
      "RENTALY_API_BASE_URL is not set — required when BACKEND_MODE=live (e.g. https://app.proprietio.com/api)",
    );
  }
  if (!apiKey) {
    throw new Error(
      "RENTALY_API_KEY is not set — required when BACKEND_MODE=live (a pk_live_… key from the rentaly admin panel)",
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/** Cents → dollars. Rentaly stores money as integer cents on the wire. */
const money = (v: number): number => v / 100;

type QueryValue = string | number | boolean | null | undefined;
type Query = Record<string, QueryValue>;

interface CallOptions {
  query?: Query;
  body?: unknown;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function call(method: string, path: string, opts: CallOptions = {}): Promise<any> {
  const { baseUrl, apiKey } = config();
  const url = new URL(baseUrl + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (err) {
    throw new Error(`rentaly API request failed (${method} ${path}): ${(err as Error).message}`);
  }

  const text = await res.text();
  let json: any;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON body — leave json undefined, fall through to error/return */
    }
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || res.statusText || `HTTP ${res.status}`;
    switch (res.status) {
      case 400:
        throw new Error(`Invalid request: ${msg}`);
      case 401:
        throw new Error(`Unauthorized — check RENTALY_API_KEY: ${msg}`);
      case 403:
        throw new Error(`Forbidden — this API key is missing the required scope: ${msg}`);
      case 404:
        throw new Error(`Not found: ${msg}`);
      case 429:
        throw new Error(`Rate limited by the rentaly API: ${msg}`);
      case 501:
        // e.g. vendor messaging not yet supported — surface the backend's message verbatim.
        throw new Error(msg);
      default:
        throw new Error(`rentaly API error (${res.status}): ${msg}`);
    }
  }

  return json;
}

/**
 * Follow rentaly's offset pagination to completion and return every mapped row.
 * This is where the `{ data, pagination }` envelope is consumed; the next offset
 * is the MCP "cursor", followed here because the frozen tool inputs can't carry
 * one. A safety cap prevents an unbounded loop if `hasMore` never clears.
 */
async function collectAll<R>(path: string, query: Query, map: (row: any) => R): Promise<R[]> {
  const out: R[] = [];
  const pageSize = 100; // rentaly's max page size — fewest round-trips.
  let offset = 0;
  for (let page = 0; page < 500; page += 1) {
    const body = await call("GET", path, { query: { ...query, limit: pageSize, offset } });
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    for (const row of rows) out.push(map(row));
    const pg = body?.pagination;
    if (!pg || !pg.hasMore || rows.length === 0) break;
    offset = (pg.offset ?? offset) + (pg.limit ?? pageSize);
  }
  return out;
}

/* ─────────────────── Entity money converters ───────────────────
 * Rentaly returns objects already in the MCP field shape (property_id, etc.),
 * so these only normalise money (cents → dollars). Property is a passthrough:
 * current_value is the one money field that already arrives in dollars.
 */

const mapProperty = (p: any): T.Property => p as T.Property;

const mapUnit = (u: any): T.Unit => ({
  ...u,
  market_rent: money(u.market_rent),
  current_rent: money(u.current_rent),
});

const mapLease = (l: any): T.Lease => ({
  ...l,
  monthly_rent: money(l.monthly_rent),
  security_deposit: money(l.security_deposit),
});

const mapResident = (r: any): T.Resident => ({
  ...r,
  balance_due: money(r.balance_due),
});

// Work order / vendor carry no money fields — passthrough. (Rentaly returns
// category and resolution_notes as null, and adds an extra `title`.)
const mapWorkOrder = (w: any): any => w;
const mapVendor = (v: any): T.Vendor => v as T.Vendor;

/* ─────────────────── The client ─────────────────── */

export const rentaly = {
  /* ---------- Properties & leasing ---------- */

  async searchProperties(args: z.infer<typeof T.SearchPropertiesInput>) {
    const properties = await collectAll(
      "/v1/properties",
      {
        city: args.city,
        state: args.state,
        owner: args.owner,
        min_units: args.min_units,
        max_units: args.max_units,
      },
      mapProperty,
    );
    return { count: properties.length, properties };
  },

  async getProperty(args: z.infer<typeof T.GetPropertyInput>) {
    const body = await call("GET", `/v1/properties/${encodeURIComponent(args.property_id)}`);
    return {
      property: mapProperty(body.property),
      units: (body.units ?? []).map(mapUnit),
      active_leases: (body.active_leases ?? []).map(mapLease),
    };
  },

  async listUnits(args: z.infer<typeof T.ListUnitsInput>) {
    const path = `/v1/properties/${encodeURIComponent(args.property_id)}/units`;
    const units: T.Unit[] = [];
    let occupancyRate = 0;
    let offset = 0;
    for (let page = 0; page < 500; page += 1) {
      const body = await call("GET", path, {
        query: { occupied_only: args.occupied_only ? true : undefined, limit: 100, offset },
      });
      if (typeof body?.occupancy_rate_pct === "number") occupancyRate = body.occupancy_rate_pct;
      const rows: any[] = Array.isArray(body?.data) ? body.data : [];
      for (const u of rows) units.push(mapUnit(u));
      const pg = body?.pagination;
      if (!pg || !pg.hasMore || rows.length === 0) break;
      offset = (pg.offset ?? offset) + (pg.limit ?? 100);
    }
    return {
      property_id: args.property_id,
      unit_count: units.length,
      occupancy_rate_pct: occupancyRate,
      units,
    };
  },

  async getLease(args: z.infer<typeof T.GetLeaseInput>) {
    const body = await call("GET", `/v1/leases/${encodeURIComponent(args.lease_id)}`);
    return {
      lease: mapLease(body.lease),
      residents: (body.residents ?? []).map(mapResident),
      unit: body.unit ? mapUnit(body.unit) : null,
    };
  },

  async listResidents(args: z.infer<typeof T.ListResidentsInput>) {
    const residents = await collectAll(
      "/v1/residents",
      { property_id: args.property_id, unit_id: args.unit_id },
      mapResident,
    );
    return { count: residents.length, residents };
  },

  /* ---------- Accounting ---------- */

  async getRentRoll(args: z.infer<typeof T.GetRentRollInput>) {
    const body = await call("GET", "/v1/rent-roll", {
      query: { scope_id: args.scope_id, as_of_date: args.as_of_date },
    });
    return {
      ...body,
      contracted_monthly_rent: money(body.contracted_monthly_rent),
      market_monthly_rent: money(body.market_monthly_rent),
      loss_to_lease: money(body.loss_to_lease),
      rows: (body.rows ?? []).map((r: any) => ({
        ...r,
        current_rent: money(r.current_rent),
        market_rent: money(r.market_rent),
      })),
    };
  },

  async getDelinquency(args: z.infer<typeof T.GetDelinquencyInput>) {
    const body = await call("GET", "/v1/delinquency", {
      query: { scope_id: args.scope_id, as_of_date: args.as_of_date, group_by: args.group_by },
    });
    const t = body.totals ?? {};
    return {
      ...body,
      totals: {
        "0_30": money(t["0_30"] ?? 0),
        "31_60": money(t["31_60"] ?? 0),
        "61_90": money(t["61_90"] ?? 0),
        "90_plus": money(t["90_plus"] ?? 0),
        total: money(t.total ?? 0),
      },
      groups: (body.groups ?? []).map((g: any) => ({
        ...g,
        ...(g.total_balance != null ? { total_balance: money(g.total_balance) } : {}),
        ...(g.balance != null ? { balance: money(g.balance) } : {}),
      })),
    };
  },

  async getIncomeStatement(args: z.infer<typeof T.GetIncomeStatementInput>) {
    const body = await call("GET", "/v1/income-statement", {
      query: { scope_id: args.scope_id, period_start: args.period_start, period_end: args.period_end },
    });
    return {
      ...body,
      revenue: (body.revenue ?? []).map((r: any) => ({ ...r, amount: money(r.amount) })),
      expenses: (body.expenses ?? []).map((r: any) => ({ ...r, amount: money(r.amount) })),
      total_revenue: money(body.total_revenue),
      total_expenses: money(body.total_expenses),
      net_income: money(body.net_income),
    };
  },

  async getBalanceSheet(args: z.infer<typeof T.GetBalanceSheetInput>) {
    const body = await call("GET", "/v1/balance-sheet", {
      query: { scope_id: args.scope_id, as_of_date: args.as_of_date },
    });
    const section = (rows: any[]) => (rows ?? []).map((r: any) => ({ ...r, amount: money(r.amount) }));
    return {
      ...body,
      assets: section(body.assets),
      liabilities: section(body.liabilities),
      equity: section(body.equity),
      total_assets: money(body.total_assets),
      total_liabilities: money(body.total_liabilities),
      total_equity: money(body.total_equity),
    };
  },

  async getNoi(args: z.infer<typeof T.GetNoiInput>) {
    const body = await call("GET", "/v1/noi", {
      query: { scope_id: args.scope_id, period_start: args.period_start, period_end: args.period_end },
    });
    return {
      ...body,
      total_revenue: money(body.total_revenue),
      operating_expenses: money(body.operating_expenses),
      noi: money(body.noi),
      opex_breakdown: (body.opex_breakdown ?? []).map((r: any) => ({ ...r, amount: money(r.amount) })),
    };
  },

  async getGeneralLedger(args: z.infer<typeof T.GetGeneralLedgerInput>) {
    const body = await call("GET", "/v1/general-ledger", {
      query: {
        scope_id: args.scope_id,
        account: args.account,
        period_start: args.period_start,
        period_end: args.period_end,
        limit: args.limit,
      },
    });
    return {
      ...body,
      entries: (body.entries ?? []).map((e: any) => ({ ...e, amount: money(e.amount) })),
    };
  },

  /* ---------- Maintenance (reads) ---------- */

  async searchWorkOrders(args: z.infer<typeof T.SearchWorkOrdersInput>) {
    const work_orders = await collectAll(
      "/v1/work-orders",
      {
        property_id: args.property_id,
        status: args.status,
        priority: args.priority,
        min_days_open: args.min_days_open,
        category: args.category,
      },
      mapWorkOrder,
    );
    return { count: work_orders.length, work_orders };
  },

  async getWorkOrder(args: z.infer<typeof T.GetWorkOrderInput>) {
    const body = await call("GET", `/v1/work-orders/${encodeURIComponent(args.work_order_id)}`);
    const { assigned_vendor, ...workOrder } = body;
    return {
      work_order: mapWorkOrder(workOrder),
      assigned_vendor: assigned_vendor ? mapVendor(assigned_vendor) : null,
    };
  },

  async listVendors(args: z.infer<typeof T.ListVendorsInput>) {
    const vendors = await collectAll(
      "/v1/vendors",
      { trade: args.trade, approved_only: args.approved_only },
      mapVendor,
    );
    return { count: vendors.length, vendors };
  },

  /* ---------- Maintenance (writes) ---------- */

  async createWorkOrder(args: z.infer<typeof T.CreateWorkOrderInput>) {
    // Decision 1: rentaly work orders are unit-scoped — fail clearly before the
    // network round-trip rather than surfacing a raw 400.
    if (!args.unit_id) {
      throw new Error(
        "unit_id is required — Proprietio work orders are unit-scoped (there is no property-level work order).",
      );
    }
    const wo = await call("POST", "/v1/work-orders", {
      body: {
        property_id: args.property_id,
        unit_id: args.unit_id,
        category: args.category, // Decision 2: folded into the ticket title server-side.
        description: args.description,
        priority: args.priority,
        assigned_vendor_id: args.assigned_vendor_id,
      },
    });
    return {
      work_order_id: wo.work_order_id,
      status: wo.status,
      created_at: wo.created_at,
      url: `https://app.proprietio.com/work-orders/${wo.work_order_id}`,
      work_order: mapWorkOrder(wo),
    };
  },

  async updateWorkOrder(args: z.infer<typeof T.UpdateWorkOrderInput>) {
    // Decision 4: rentaly has no cancelled state — surface a clear error.
    if (args.status === "cancelled") {
      throw new Error(
        "Work orders cannot be cancelled in Proprietio (no cancelled state). Set another status or close the work order instead.",
      );
    }
    const wo = await call("PATCH", `/v1/work-orders/${encodeURIComponent(args.work_order_id)}`, {
      body: {
        status: args.status,
        priority: args.priority,
        assigned_vendor_id: args.assigned_vendor_id,
        notes: args.notes,
      },
    });
    return { work_order_id: wo.work_order_id, updated: mapWorkOrder(wo) };
  },

  async closeWorkOrder(args: z.infer<typeof T.CloseWorkOrderInput>) {
    const wo = await call("POST", `/v1/work-orders/${encodeURIComponent(args.work_order_id)}/close`, {
      body: { resolution_notes: args.resolution_notes },
    });
    return { work_order_id: wo.work_order_id, status: wo.status, closed_at: wo.updated_at };
  },

  /* ---------- Comms ---------- */

  async sendMessage(args: z.infer<typeof T.SendMessageInput>) {
    // Decision 3: rentaly chat is resident↔staff only — vendors have no thread.
    if (args.to_vendor_id && !args.to_resident_id) {
      throw new Error(
        "Vendor messaging is not supported yet — only residents can be messaged. Provide to_resident_id.",
      );
    }
    const body = await call("POST", "/v1/messages", {
      body: {
        to_resident_id: args.to_resident_id,
        to_vendor_id: args.to_vendor_id,
        subject: args.subject,
        body: args.body,
      },
    });
    return {
      message_id: body.message_id,
      conversation_id: body.conversation_id,
      to_resident_id: body.to_resident_id,
      sent_at: body.sent_at,
      status: "sent",
    };
  },
};
