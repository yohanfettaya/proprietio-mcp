/**
 * Contract test — MCP tool annotations.
 *
 * The OpenAI Apps directory and the Anthropic Connectors directory both reject
 * any tool whose behaviour hints are not EXPLICIT booleans: an omitted hint
 * reads as "unknown", not as a safe default. (The original rejection was
 * `idempotentHint` missing on read tools.) This test fails CI if any
 * tool is missing a title, is missing/null on any of the four hints, lacks a
 * behavioural rationale, or drifts from the agreed mapping.
 *
 * It runs fully OFFLINE (no backend, no secret) — unlike the live smoke — so it
 * gates every PR. Run with: `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mcpInputSchemaForTool } from "../src/server.js";
import { allTools } from "../src/tools/index.js";

type JsonObject = Record<string, unknown>;

function toolSchema(name: string): JsonObject {
  const tool = allTools.find((t) => t.name === name);
  assert.ok(tool, `${name}: tool must be registered`);
  return mcpInputSchemaForTool(tool);
}

function schemaProperties(schema: JsonObject): Record<string, JsonObject> {
  const properties = schema.properties as Record<string, JsonObject> | undefined;
  assert.ok(properties, "schema must expose object properties");
  return properties;
}

// The agreed mapping. openWorldHint is false for every tool EXCEPT
// proprietio_send_message: that tool dispatches an external email to the
// recipient's own inbox via the configured mail provider, reaching outside our
// host environment, which is a true open-world interaction per the MCP spec.
// Every other tool only touches the configured Proprietio backend.
// idempotentHint: every read is idempotent; among writes, only close_work_order
// converges to a terminal state (re-closing is a no-op), while create/update/
// send each have a fresh effect per call. destructiveHint is conservative:
// updating or closing a work order changes an existing operational record, and
// send_message reaches a real recipient.
const EXPECTED: Record<
  string,
  {
    title: string;
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
  }
> = {
  // Read-only (18 public + 1 debug) — all idempotent
  proprietio_get_daily_brief: { title: "Get Daily Operations Brief", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_command_center: { title: "Get Operations Command Center", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_owner_update: { title: "Generate Owner Update", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  proprietio_get_risk_radar: { title: "Get Portfolio Risk Radar", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
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
  // Write, additive (1)
  proprietio_create_work_order: { title: "Create Work Order", readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  // Write, changes existing operational state (2)
  proprietio_update_work_order: { title: "Update Work Order", readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  proprietio_close_work_order: { title: "Close Work Order", readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  // Write, externally-impacting (reaches a real human) (1)
  proprietio_send_message: { title: "Send Tenant or Vendor Message", readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  // Debug (1)
  proprietio_whoami: { title: "Who Am I (Debug)", readOnlyHint: true, destructiveHint: false, idempotentHint: true },
};

// The 19 read tools and 4 write tools (debug whoami counts as read).
const READ_TOOLS = Object.entries(EXPECTED).filter(([, v]) => v.readOnlyHint).map(([k]) => k);
const WRITE_TOOLS = Object.entries(EXPECTED).filter(([, v]) => !v.readOnlyHint).map(([k]) => k);

test("all 23 tools are registered (22 public + 1 debug)", () => {
  assert.equal(allTools.length, 23);
});

test("read/write split is exactly 19 / 4 (18 public reads + 1 debug + 4 writes)", () => {
  assert.equal(READ_TOOLS.length, 19, "expected 19 read tools (18 public + whoami debug)");
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

test("the 19 read tools have readOnlyHint=true", () => {
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

test("only state-changing existing-record writes and send_message have destructiveHint=true", () => {
  for (const tool of allTools) {
    const expectDestructive = [
      "proprietio_update_work_order",
      "proprietio_close_work_order",
      "proprietio_send_message",
    ].includes(tool.name);
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

test("review-sensitive schemas express exactly-one target arguments", () => {
  assert.deepEqual(toolSchema("proprietio_list_residents").oneOf, [
    { required: ["property_id"], not: { required: ["unit_id"] } },
    { required: ["unit_id"], not: { required: ["property_id"] } },
  ]);
  assert.deepEqual(toolSchema("proprietio_send_message").oneOf, [
    { required: ["to_resident_id"], not: { required: ["to_vendor_id"] } },
    { required: ["to_vendor_id"], not: { required: ["to_resident_id"] } },
  ]);
});

test("review-sensitive schemas describe scope IDs, dates, and GL account filters", () => {
  for (const name of [
    "proprietio_get_daily_brief",
    "proprietio_get_command_center",
    "proprietio_get_owner_update",
    "proprietio_get_risk_radar",
    "proprietio_get_rent_roll",
    "proprietio_get_delinquency",
    "proprietio_get_income_statement",
    "proprietio_get_balance_sheet",
    "proprietio_get_general_ledger",
    "proprietio_get_noi",
  ]) {
    const properties = schemaProperties(toolSchema(name));
    assert.match(String(properties.scope_id.description), /prop_001/);
    assert.match(String(properties.scope_id.description), /port_tx/);

    for (const dateField of ["as_of_date", "period_start", "period_end"]) {
      if (properties[dateField]) {
        assert.equal(properties[dateField].format, "date", `${name}: ${dateField} format`);
        assert.match(String(properties[dateField].description), /YYYY-MM-DD/, `${name}: ${dateField} description`);
      }
    }
  }

  const glProperties = schemaProperties(toolSchema("proprietio_get_general_ledger"));
  assert.match(String(glProperties.account.description), /4000-Rental Income/);
  assert.match(String(glProperties.account.description), /omit to include all accounts/);
});

test("runtime validation rejects ambiguous exactly-one target arguments", () => {
  const residents = allTools.find((t) => t.name === "proprietio_list_residents")!;
  assert.equal(residents.inputSchema.safeParse({}).success, false);
  assert.equal(residents.inputSchema.safeParse({ property_id: "prop_001", unit_id: "unit_001_101" }).success, false);
  assert.equal(residents.inputSchema.safeParse({ property_id: "prop_001" }).success, true);
  assert.equal(residents.inputSchema.safeParse({ unit_id: "unit_001_101" }).success, true);

  const sendMessage = allTools.find((t) => t.name === "proprietio_send_message")!;
  assert.equal(sendMessage.inputSchema.safeParse({ subject: "Hi", body: "Hello" }).success, false);
  assert.equal(
    sendMessage.inputSchema.safeParse({
      to_resident_id: "res_001",
      to_vendor_id: "vendor_001",
      subject: "Hi",
      body: "Hello",
    }).success,
    false,
  );
  assert.equal(sendMessage.inputSchema.safeParse({ to_resident_id: "res_001", subject: "Hi", body: "Hello" }).success, true);
  assert.equal(sendMessage.inputSchema.safeParse({ to_vendor_id: "vendor_001", subject: "Hi", body: "Hello" }).success, true);
});
