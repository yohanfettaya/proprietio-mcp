/**
 * Contract test — MCP tool annotations.
 *
 * The OpenAI Apps directory and the Anthropic Connectors directory both reject
 * any tool whose behaviour hints are not EXPLICIT booleans: an omitted hint
 * reads as "unknown", not as a safe default. (The original rejection was
 * `idempotentHint` missing on the 14 read tools.) This test fails CI if any
 * tool is missing a title, is missing/null on any of the four hints, lacks a
 * behavioural rationale, or drifts from the agreed mapping.
 *
 * It runs fully OFFLINE (no backend, no secret) — unlike the live smoke — so it
 * gates every PR. Run with: `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { allTools } from "../src/tools/index.js";

// The agreed mapping. openWorldHint is false for every tool EXCEPT
// proprietio_send_message: that tool dispatches an external email to the
// recipient's own inbox via the configured mail provider, reaching outside our
// host environment, which is a true open-world interaction per the MCP spec.
// Every other tool only touches the configured Proprietio backend.
// idempotentHint: every read is idempotent; among writes, only close_work_order
// converges to a terminal state (re-closing is a no-op), while create/update/
// send each have a fresh effect per call.
const EXPECTED: Record<
  string,
  {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
  }
> = {
  // Read-only (14) — all idempotent
  proprietio_search_properties: { title: "Search Properties", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_property: { title: "Get Property Details", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_list_units: { title: "List Units in a Property", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_lease: { title: "Get Lease Details", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_list_residents: { title: "List Residents", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_rent_roll: { title: "Get Rent Roll Snapshot", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_delinquency: { title: "Get Delinquency Aging Report", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_income_statement: { title: "Get Income Statement", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_balance_sheet: { title: "Get Balance Sheet", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_general_ledger: { title: "Get General Ledger Entries", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_noi: { title: "Get Net Operating Income", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_search_work_orders: { title: "Search Work Orders", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_work_order: { title: "Get Work Order Details", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_list_vendors: { title: "List Approved Vendors", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  // Write, non-destructive (3)
  proprietio_create_work_order: { title: "Create Work Order", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  proprietio_update_work_order: { title: "Update Work Order", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  proprietio_close_work_order: { title: "Close Work Order", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  // Write, externally-impacting (reaches a real human) (1)
  proprietio_send_message: { title: "Send Tenant or Vendor Message", readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  // Debug (1)
  proprietio_whoami: { title: "Who Am I (Debug)", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
};

// The 15 read tools and 4 write tools (debug whoami counts as read).
const READ_TOOLS = Object.entries(EXPECTED).filter(([, v]) => v.readOnlyHint).map(([k]) => k);
const WRITE_TOOLS = Object.entries(EXPECTED).filter(([, v]) => !v.readOnlyHint).map(([k]) => k);

test("all 19 tools are registered (18 public + 1 debug)", () => {
  assert.equal(allTools.length, 19);
});

test("read/write split is exactly 15 / 4 (14 public reads + 1 debug + 4 writes)", () => {
  assert.equal(READ_TOOLS.length, 15, "expected 15 read tools (14 public + whoami debug)");
  assert.equal(WRITE_TOOLS.length, 4, "expected 4 write tools");
});

test("every tool declares a non-empty title", () => {
  for (const tool of allTools) {
    assert.equal(typeof tool.title, "string", `${tool.name}: title must be a string`);
    assert.ok(tool.title.length > 0, `${tool.name}: title must be non-empty`);
  }
});

test("every tool has all 4 hint booleans defined (no null/undefined)", () => {
  for (const tool of allTools) {
    const a = tool.annotations;
    assert.ok(a, `${tool.name}: missing annotations`);
    for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
      assert.equal(
        typeof a[hint],
        "boolean",
        `${tool.name}: ${hint} must be an explicit boolean, got ${a[hint] === null ? "null" : typeof a[hint]}`,
      );
    }
  }
});

test("openWorldHint is true only for proprietio_send_message (external email dispatch)", () => {
  for (const tool of allTools) {
    const expectOpenWorld = tool.name === "proprietio_send_message";
    assert.equal(
      tool.annotations.openWorldHint,
      expectOpenWorld,
      `${tool.name}: openWorldHint should be ${expectOpenWorld}`,
    );
  }
});

test("the 15 read tools have readOnlyHint=true", () => {
  for (const name of READ_TOOLS) {
    const tool = allTools.find((t) => t.name === name)!;
    assert.ok(tool, `${name}: not registered`);
    assert.equal(tool.annotations.readOnlyHint, true, `${name}: read tool must have readOnlyHint=true`);
  }
});

test("the 4 write tools have readOnlyHint=false", () => {
  for (const name of WRITE_TOOLS) {
    const tool = allTools.find((t) => t.name === name)!;
    assert.ok(tool, `${name}: not registered`);
    assert.equal(tool.annotations.readOnlyHint, false, `${name}: write tool must have readOnlyHint=false`);
  }
});

test("only proprietio_send_message has destructiveHint=true", () => {
  for (const tool of allTools) {
    const expectDestructive = tool.name === "proprietio_send_message";
    assert.equal(
      tool.annotations.destructiveHint,
      expectDestructive,
      `${tool.name}: destructiveHint should be ${expectDestructive}`,
    );
  }
});

test("every tool has a non-empty behavioural rationale", () => {
  for (const tool of allTools) {
    assert.equal(typeof tool.annotationRationale, "string", `${tool.name}: annotationRationale must be a string`);
    assert.ok(
      tool.annotationRationale.trim().length >= 20,
      `${tool.name}: annotationRationale must be a meaningful justification`,
    );
  }
});

test("titles and all four hints match the agreed mapping", () => {
  const seenNames = new Set<string>();
  for (const tool of allTools) {
    const want = EXPECTED[tool.name];
    assert.ok(want, `${tool.name}: not in the expected mapping`);
    seenNames.add(tool.name);
    assert.equal(tool.title, want.title, `${tool.name}: title`);
    assert.equal(tool.annotations.readOnlyHint, want.readOnlyHint, `${tool.name}: readOnlyHint`);
    assert.equal(tool.annotations.destructiveHint, want.destructiveHint, `${tool.name}: destructiveHint`);
    assert.equal(tool.annotations.idempotentHint, want.idempotentHint, `${tool.name}: idempotentHint`);
    assert.equal(tool.annotations.openWorldHint, tool.name === "proprietio_send_message", `${tool.name}: openWorldHint`);
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
