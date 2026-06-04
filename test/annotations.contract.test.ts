/**
 * Contract test — MCP tool annotations.
 *
 * The Anthropic Connectors directory submission requires every tool to declare
 * a user-friendly `title` plus the behaviour hints `readOnlyHint`,
 * `destructiveHint`, and `openWorldHint`. This test fails CI if any tool is
 * missing one of those, or if a value drifts from the agreed mapping.
 *
 * It runs fully OFFLINE (no backend, no secret) — unlike the live smoke — so it
 * gates every PR. Run with: `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { allTools } from "../src/tools/index.js";

// The agreed mapping (Phase 4). readOnlyHint / destructiveHint per tool;
// openWorldHint is false for every tool (we only touch the configured
// Proprietio backend, never the arbitrary web).
const EXPECTED: Record<
  string,
  { title: string; readOnlyHint: boolean; destructiveHint: boolean }
> = {
  // Read-only
  proprietio_search_properties: { title: "Search Properties", readOnlyHint: true, destructiveHint: false },
  proprietio_get_property: { title: "Get Property Details", readOnlyHint: true, destructiveHint: false },
  proprietio_list_units: { title: "List Units in a Property", readOnlyHint: true, destructiveHint: false },
  proprietio_get_lease: { title: "Get Lease Details", readOnlyHint: true, destructiveHint: false },
  proprietio_list_residents: { title: "List Residents", readOnlyHint: true, destructiveHint: false },
  proprietio_get_rent_roll: { title: "Get Rent Roll Snapshot", readOnlyHint: true, destructiveHint: false },
  proprietio_get_delinquency: { title: "Get Delinquency Aging Report", readOnlyHint: true, destructiveHint: false },
  proprietio_get_income_statement: { title: "Get Income Statement", readOnlyHint: true, destructiveHint: false },
  proprietio_get_balance_sheet: { title: "Get Balance Sheet", readOnlyHint: true, destructiveHint: false },
  proprietio_get_general_ledger: { title: "Get General Ledger Entries", readOnlyHint: true, destructiveHint: false },
  proprietio_get_noi: { title: "Get Net Operating Income", readOnlyHint: true, destructiveHint: false },
  proprietio_search_work_orders: { title: "Search Work Orders", readOnlyHint: true, destructiveHint: false },
  proprietio_get_work_order: { title: "Get Work Order Details", readOnlyHint: true, destructiveHint: false },
  proprietio_list_vendors: { title: "List Approved Vendors", readOnlyHint: true, destructiveHint: false },
  // Write, non-destructive
  proprietio_create_work_order: { title: "Create Work Order", readOnlyHint: false, destructiveHint: false },
  proprietio_update_work_order: { title: "Update Work Order", readOnlyHint: false, destructiveHint: false },
  proprietio_close_work_order: { title: "Close Work Order", readOnlyHint: false, destructiveHint: false },
  // Write, externally-impacting (reaches a real human)
  proprietio_send_message: { title: "Send Tenant or Vendor Message", readOnlyHint: false, destructiveHint: true },
};

test("all 18 tools are registered", () => {
  assert.equal(allTools.length, 18);
});

test("every tool declares title, readOnlyHint, destructiveHint, openWorldHint", () => {
  for (const tool of allTools) {
    const a = tool.annotations;
    assert.ok(a, `${tool.name}: missing annotations`);
    assert.equal(typeof tool.title, "string", `${tool.name}: title must be a string`);
    assert.ok(tool.title.length > 0, `${tool.name}: title must be non-empty`);
    assert.equal(typeof a!.readOnlyHint, "boolean", `${tool.name}: readOnlyHint must be boolean`);
    assert.equal(typeof a!.destructiveHint, "boolean", `${tool.name}: destructiveHint must be boolean`);
    assert.equal(typeof a!.openWorldHint, "boolean", `${tool.name}: openWorldHint must be boolean`);
  }
});

test("openWorldHint is false for every tool", () => {
  for (const tool of allTools) {
    assert.equal(tool.annotations!.openWorldHint, false, `${tool.name}: openWorldHint must be false`);
  }
});

test("titles and read/destructive hints match the agreed mapping", () => {
  const seenNames = new Set<string>();
  for (const tool of allTools) {
    const want = EXPECTED[tool.name];
    assert.ok(want, `${tool.name}: not in the expected mapping`);
    seenNames.add(tool.name);
    assert.equal(tool.title, want.title, `${tool.name}: title`);
    assert.equal(tool.annotations!.readOnlyHint, want.readOnlyHint, `${tool.name}: readOnlyHint`);
    assert.equal(tool.annotations!.destructiveHint, want.destructiveHint, `${tool.name}: destructiveHint`);
  }
  // Every expected tool was present (no silent drops).
  for (const name of Object.keys(EXPECTED)) {
    assert.ok(seenNames.has(name), `${name}: expected but not registered`);
  }
});

test("titles are unique and human-friendly (no raw tool names leak)", () => {
  const titles = allTools.map((t) => t.title);
  assert.equal(new Set(titles).size, titles.length, "titles must be unique");
  for (const tool of allTools) {
    assert.ok(!tool.title.startsWith("proprietio_"), `${tool.name}: title looks like a raw tool name`);
  }
});
