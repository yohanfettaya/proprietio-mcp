/**
 * Contract tests for the deterministic reviewer prompts submitted to OpenAI.
 *
 * These run against the embedded mock portfolio and assert the exact outputs
 * documented in docs/chatgpt-apps-sdk-submission.md.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { allTools } from "../src/tools/index.js";

async function callTool(name: string, args: Record<string, unknown>) {
  const tool = allTools.find((t) => t.name === name);
  assert.ok(tool, `${name}: tool must be registered`);
  const parsed = tool.inputSchema.parse(args);
  return tool.handler(parsed) as Promise<Record<string, unknown>> | Record<string, unknown>;
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("review prompt: search Texas properties returns the seeded portfolio", async () => {
  const result = await callTool("proprietio_search_properties", { state: "TX" });
  const properties = result.properties as Array<{ property_id: string; name: string }>;

  assert.equal(result.count, 3);
  assert.deepEqual(
    properties.map((p) => [p.property_id, p.name]),
    [
      ["prop_001", "The Madison"],
      ["prop_002", "Riverbend Lofts"],
      ["prop_003", "Hill Country Commons"],
    ],
  );
});

test("review prompt: delinquency by property has stable totals", async () => {
  const result = await callTool("proprietio_get_delinquency", {
    scope_id: "port_tx",
    as_of_date: "2026-05-31",
    group_by: "property",
  });

  assert.deepEqual(result.totals, {
    "0_30": 8950,
    "31_60": 2150,
    "61_90": 1700,
    "90_plus": 0,
    total: 12800,
  });
  assert.deepEqual(result.groups, [
    { property_id: "prop_001", property_name: "The Madison", total_balance: 7250 },
    { property_id: "prop_002", property_name: "Riverbend Lofts", total_balance: 3850 },
    { property_id: "prop_003", property_name: "Hill Country Commons", total_balance: 1700 },
  ]);
});

test("review prompt: The Madison May 2026 NOI is one month, not timezone shifted", async () => {
  const result = await callTool("proprietio_get_noi", {
    scope_id: "prop_001",
    period_start: "2026-05-01",
    period_end: "2026-05-31",
  });

  assert.equal(result.months, 1);
  assert.equal(result.total_revenue, 6864);
  assert.equal(result.operating_expenses, 2883);
  assert.equal(result.noi, 3981);
  assert.equal(result.noi_margin_pct, 58);
});

test("review prompt: open work orders older than 7 days are stable", async () => {
  const result = await callTool("proprietio_search_work_orders", {
    status: "open",
    min_days_open: 7,
  });
  const workOrders = result.work_orders as Array<{ work_order_id: string }>;

  assert.equal(result.count, 2);
  assert.deepEqual(workOrders.map((w) => w.work_order_id), ["wo_002", "wo_004"]);
});

test("review prompt: residents at The Madison with balances are stable", async () => {
  const result = await callTool("proprietio_list_residents", {
    property_id: "prop_001",
  });
  const residents = result.residents as Array<Record<string, unknown> & { full_name: string; balance_due: number }>;

  assert.equal(result.count, 4);
  assert.deepEqual(
    residents.map((r) => [r.full_name, r.balance_due]),
    [
      ["Sarah Chen", 0],
      ["Marcus Johnson", 2350],
      ["Elena Johnson", 0],
      ["David Park", 4900],
    ],
  );
  for (const resident of residents) {
    assert.equal("email" in resident, false);
    assert.equal("phone" in resident, false);
    assert.equal("resident_id" in resident, false);
    assert.equal("unit_id" in resident, false);
    assert.equal("property_id" in resident, false);
  }
});

test("resident contact fields are returned only when explicitly requested", async () => {
  const result = await callTool("proprietio_list_residents", {
    property_id: "prop_001",
    include_contact_info: true,
  });
  const residents = result.residents as Array<Record<string, unknown>>;

  assert.equal(result.count, 4);
  assert.equal(residents[0].resident_id, "res_001");
  assert.equal(residents[0].email, "sarah.chen@example.com");
  assert.equal(residents[0].phone, "+1-512-555-0101");
});

test("review fixture mode keeps submitted prompts deterministic even with the live backend enabled", async () => {
  const previousBackendMode = process.env.BACKEND_MODE;
  const previousReviewFixtures = process.env.OPENAI_REVIEW_FIXTURES;
  process.env.BACKEND_MODE = "live";
  process.env.OPENAI_REVIEW_FIXTURES = "true";

  try {
    const propertiesResult = await callTool("proprietio_search_properties", { state: "TX" });
    assert.equal(propertiesResult.count, 3);

    const delinquencyResult = await callTool("proprietio_get_delinquency", {
      scope_id: "port_tx",
      as_of_date: "2026-05-31",
      group_by: "property",
    });
    assert.deepEqual(delinquencyResult.totals, {
      "0_30": 8950,
      "31_60": 2150,
      "61_90": 1700,
      "90_plus": 0,
      total: 12800,
    });

    const noiResult = await callTool("proprietio_get_noi", {
      scope_id: "prop_001",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
    });
    assert.equal(noiResult.noi, 3981);

    const workOrdersResult = await callTool("proprietio_search_work_orders", {
      status: "open",
      min_days_open: 7,
    });
    assert.deepEqual(
      (workOrdersResult.work_orders as Array<{ work_order_id: string }>).map((w) => w.work_order_id),
      ["wo_002", "wo_004"],
    );

    const residentsResult = await callTool("proprietio_list_residents", {
      property_id: "prop_001",
    });
    const reviewResidents = residentsResult.residents as Array<
      Record<string, unknown> & { full_name: string; balance_due: number }
    >;
    assert.deepEqual(
      reviewResidents.map((r) => [
        r.full_name,
        r.balance_due,
      ]),
      [
        ["Sarah Chen", 0],
        ["Marcus Johnson", 2350],
        ["Elena Johnson", 0],
        ["David Park", 4900],
      ],
    );
    for (const resident of reviewResidents) {
      assert.equal("email" in resident, false);
      assert.equal("phone" in resident, false);
      assert.equal("resident_id" in resident, false);
    }
  } finally {
    restoreEnv("BACKEND_MODE", previousBackendMode);
    restoreEnv("OPENAI_REVIEW_FIXTURES", previousReviewFixtures);
  }
});
