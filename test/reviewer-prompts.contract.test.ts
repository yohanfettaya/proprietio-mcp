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

function assertNoResidentPii(result: unknown) {
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("sarah.chen@example.com"), false);
  assert.equal(serialized.includes("+1-512-555-0101"), false);
  assert.equal(serialized.includes("resident_id"), false);
  assert.equal(serialized.includes("m.johnson@example.com"), false);
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

test("v2 daily brief prioritizes operations without resident PII", async () => {
  const result = await callTool("proprietio_get_daily_brief", {
    scope_id: "port_tx",
    as_of_date: "2026-05-31",
    max_items: 6,
  });
  const priorities = result.priorities as Array<Record<string, unknown>>;
  const riskSummary = result.risk_summary as Record<string, unknown>;

  assert.match(String(result.headline), /urgent work order/);
  assert.equal((result.portfolio as Record<string, unknown>).unit_count, 10);
  assert.equal(riskSummary.delinquency_total, 12800);
  assert.equal(riskSummary.urgent_work_order_count, 3);
  assert.equal(riskSummary.stale_work_order_count, 3);
  assert.ok(priorities.length > 0);
  assert.equal(priorities[0].priority, "critical");
  assert.equal(priorities[0].source_id, "wo_006");

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("sarah.chen@example.com"), false);
  assert.equal(serialized.includes("+1-512-555-0101"), false);
  assert.equal(serialized.includes("resident_id"), false);
});

test("v3 command center returns ranked KPIs, scorecards, and action queue without resident PII", async () => {
  const result = await callTool("proprietio_get_command_center", {
    scope_id: "port_tx",
    as_of_date: "2026-05-31",
    period_start: "2026-05-01",
    period_end: "2026-05-31",
    max_actions: 5,
  });
  const kpis = result.kpis as Array<{ id: string; value: number; trend: string }>;
  const scorecards = result.property_scorecards as Array<Record<string, unknown>>;
  const actionQueue = result.action_queue as Array<Record<string, unknown>>;
  const riskSummary = result.risk_summary as Record<string, unknown>;
  const highestRisk = riskSummary.highest_risk_property as Record<string, unknown>;

  assert.equal(result.version, "3.0.0");
  assert.deepEqual(kpis.map((k) => [k.id, k.value, k.trend]), [
    ["occupancy", 80, "risk"],
    ["delinquency", 12800, "risk"],
    ["maintenance_load", 5, "risk"],
    ["loss_to_lease", 3450, "watch"],
    ["risk_exposure", 3, "risk"],
  ]);
  assert.deepEqual(
    scorecards.map((s) => [s.property_id, s.property_name, s.risk_score, s.risk_level]),
    [
      ["prop_001", "The Madison", 89, "critical"],
      ["prop_002", "Riverbend Lofts", 53, "medium"],
      ["prop_003", "Hill Country Commons", 51, "medium"],
    ],
  );
  assert.deepEqual(highestRisk, {
    property_id: "prop_001",
    property_name: "The Madison",
    risk_score: 89,
    risk_level: "critical",
    top_risk: "1 high-priority work order(s) active",
  });
  assert.equal(actionQueue[0].source_id, "wo_006");
  assert.equal(actionQueue[0].priority, "critical");
  assert.equal((result.ui_model as Record<string, unknown>).presentation, "operations_command_center");
  assertNoResidentPii(result);
});

test("v3 risk radar filters critical properties and identifies category-level drivers", async () => {
  const result = await callTool("proprietio_get_risk_radar", {
    scope_id: "port_tx",
    as_of_date: "2026-05-31",
    risk_threshold: "critical",
  });
  const scorecards = result.property_scorecards as Array<Record<string, unknown>>;
  const radar = result.radar as Array<Record<string, unknown>>;
  const summary = result.summary as Record<string, unknown>;

  assert.equal(result.risk_threshold, "critical");
  assert.deepEqual(scorecards.map((s) => [s.property_id, s.risk_level]), [["prop_001", "critical"]]);
  assert.equal(summary.average_risk_score, 64);
  assert.deepEqual(summary.risk_level_counts, {
    critical: 1,
    high: 0,
    medium: 2,
    low: 0,
    healthy: 0,
  });
  assert.equal(radar[0].category, "maintenance");
  assert.equal(radar[0].risk_score, 100);
  assert.equal(radar[0].top_factor, "1 emergency work order(s) active");
  assertNoResidentPii(result);
});

test("v3 owner update generates a copy-ready portfolio update without resident PII", async () => {
  const result = await callTool("proprietio_get_owner_update", {
    scope_id: "port_tx",
    as_of_date: "2026-05-31",
    period_start: "2026-05-01",
    period_end: "2026-05-31",
    tone: "executive",
  });
  const financials = result.financials as Record<string, unknown>;
  const ownerUpdate = result.owner_update as Record<string, unknown>;
  const actionPlan = ownerUpdate.action_plan as Array<Record<string, unknown>>;

  assert.deepEqual(financials, {
    months: 1,
    total_revenue: 17420,
    operating_expenses: 7316,
    noi: 10104,
    noi_margin_pct: 58,
  });
  assert.equal(ownerUpdate.subject, "Portfolio owner update: 2026-05-01 to 2026-05-31");
  assert.match(String(ownerUpdate.executive_summary), /\$10,104 NOI/);
  assert.equal(actionPlan[0].source_id, "wo_006");
  assert.equal(actionPlan[0].priority, "critical");
  assert.match(String(ownerUpdate.copy_ready_email_body), /Next actions:/);
  assert.match(String(ownerUpdate.copy_ready_email_body), /Proprietio/);
  assertNoResidentPii(result);
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

    const commandCenterResult = await callTool("proprietio_get_command_center", {
      scope_id: "port_tx",
      as_of_date: "2026-05-31",
      max_actions: 5,
    });
    assert.equal((commandCenterResult.risk_summary as Record<string, any>).highest_risk_property.property_id, "prop_001");
    assert.equal((commandCenterResult.action_queue as Array<Record<string, unknown>>)[0].source_id, "wo_006");

    const ownerUpdateResult = await callTool("proprietio_get_owner_update", {
      scope_id: "port_tx",
      as_of_date: "2026-05-31",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
    });
    assert.equal((ownerUpdateResult.financials as Record<string, unknown>).noi, 10104);
  } finally {
    restoreEnv("BACKEND_MODE", previousBackendMode);
    restoreEnv("OPENAI_REVIEW_FIXTURES", previousReviewFixtures);
  }
});
