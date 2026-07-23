/**
 * OpenAI review fixtures.
 *
 * The submitted reviewer test cases use deterministic mock IDs (`prop_001`,
 * `port_tx`, `wo_002`, etc.). Production normally runs against the live Rentaly
 * backend, whose demo org can drift. When enabled explicitly, keep those review
 * prompts stable while leaving real live IDs on the live path.
 */
import type { z } from "zod";
import type {
  GetBalanceSheetInput,
  GetDelinquencyInput,
  GetGeneralLedgerInput,
  GetIncomeStatementInput,
  GetLeaseInput,
  GetNoiInput,
  GetPropertyInput,
  GetRentRollInput,
  GetWorkOrderInput,
  ListResidentsInput,
  ListUnitsInput,
  SearchPropertiesInput,
  SearchWorkOrdersInput,
} from "./types.js";

const REVIEW_PROPERTY_IDS = new Set(["prop_001", "prop_002", "prop_003"]);
const REVIEW_LEASE_IDS = new Set([
  "lease_a1",
  "lease_a2",
  "lease_a3",
  "lease_b1",
  "lease_b2",
  "lease_b3",
  "lease_c1",
  "lease_c2",
]);
const REVIEW_WORK_ORDER_IDS = new Set([
  "wo_001",
  "wo_002",
  "wo_003",
  "wo_004",
  "wo_005",
  "wo_006",
]);
const REVIEW_PORTFOLIO_IDS = new Set(["port_tx", "portfolio"]);

export function reviewFixturesEnabled(): boolean {
  return process.env.OPENAI_REVIEW_FIXTURES === "true";
}

export function isReviewPropertyId(propertyId: string | undefined): boolean {
  return Boolean(propertyId && REVIEW_PROPERTY_IDS.has(propertyId));
}

export function isReviewScopeId(scopeId: string | undefined): boolean {
  return Boolean(scopeId && (REVIEW_PORTFOLIO_IDS.has(scopeId) || REVIEW_PROPERTY_IDS.has(scopeId)));
}

export function shouldUseReviewSearchProperties(
  args: z.infer<typeof SearchPropertiesInput>,
): boolean {
  return (
    reviewFixturesEnabled() &&
    args.state === "TX" &&
    args.city == null &&
    args.owner == null &&
    args.min_units == null &&
    args.max_units == null
  );
}

export function shouldUseReviewGetProperty(args: z.infer<typeof GetPropertyInput>): boolean {
  return reviewFixturesEnabled() && isReviewPropertyId(args.property_id);
}

export function shouldUseReviewListUnits(args: z.infer<typeof ListUnitsInput>): boolean {
  return reviewFixturesEnabled() && isReviewPropertyId(args.property_id);
}

export function shouldUseReviewGetLease(args: z.infer<typeof GetLeaseInput>): boolean {
  return reviewFixturesEnabled() && REVIEW_LEASE_IDS.has(args.lease_id);
}

export function shouldUseReviewListResidents(
  args: z.infer<typeof ListResidentsInput>,
): boolean {
  return (
    reviewFixturesEnabled() &&
    (isReviewPropertyId(args.property_id) || Boolean(args.unit_id?.startsWith("unit_")))
  );
}

export function shouldUseReviewAccountingScope(
  args: z.infer<
    | typeof GetRentRollInput
    | typeof GetDelinquencyInput
    | typeof GetIncomeStatementInput
    | typeof GetBalanceSheetInput
    | typeof GetGeneralLedgerInput
    | typeof GetNoiInput
  >,
): boolean {
  return reviewFixturesEnabled() && isReviewScopeId(args.scope_id);
}

export function shouldUseReviewSearchWorkOrders(
  args: z.infer<typeof SearchWorkOrdersInput>,
): boolean {
  return (
    reviewFixturesEnabled() &&
    args.property_id == null &&
    args.status === "open" &&
    args.priority == null &&
    args.min_days_open === 7 &&
    args.category == null
  );
}

export function shouldUseReviewGetWorkOrder(args: z.infer<typeof GetWorkOrderInput>): boolean {
  return reviewFixturesEnabled() && REVIEW_WORK_ORDER_IDS.has(args.work_order_id);
}
