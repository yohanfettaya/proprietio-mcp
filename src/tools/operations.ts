/**
 * Operations cockpit tools (V3).
 */
import {
  GetCommandCenterInput,
  GetDailyBriefInput,
  GetOwnerUpdateInput,
  GetRiskRadarInput,
  type Property,
  type Unit,
  type Lease,
  type Resident,
  type WorkOrder,
} from "../types.js";
import { properties, units, leases, residents, workOrders } from "../data/mock.js";
import { rentaly, isLiveBackend } from "../api/rentaly-client.js";
import { isReviewScopeId, reviewFixturesEnabled } from "../review-fixtures.js";
import type { ToolDefinition } from "./index.js";

type PriorityLevel = "critical" | "high" | "medium" | "low";
type RiskLevel = "critical" | "high" | "medium" | "low" | "healthy";
type KpiTrend = "good" | "watch" | "risk";

type BriefPriority = {
  priority: PriorityLevel;
  category: "maintenance" | "delinquency" | "leasing" | "revenue";
  title: string;
  reason: string;
  recommended_next_action: string;
  source_tool: string;
  source_id?: string;
  url?: string;
};

type RentRollSummary = {
  unit_count: number;
  occupied_count: number;
  occupancy_pct: number;
  contracted_monthly_rent: number;
  market_monthly_rent: number;
  loss_to_lease: number;
};

type DelinquencyGroup = {
  property_id?: string;
  property_name?: string;
  total_balance?: number;
};

type RentRollUnit = {
  property_id: string;
  occupied: boolean;
  current_rent: number;
  market_rent: number;
};

type BriefData = {
  properties: Property[];
  rentRoll: RentRollSummary;
  delinquencyTotal: number;
  delinquencyGroups: DelinquencyGroup[];
  workOrders: WorkOrder[];
  leases?: Lease[];
  units?: Unit[];
  rentRollRows?: RentRollUnit[];
};

type FinancialSnapshot = {
  months: number;
  total_revenue: number;
  operating_expenses: number;
  noi: number;
  noi_margin_pct: number;
};

type RiskFactor = {
  category: "maintenance" | "delinquency" | "leasing" | "revenue";
  severity: PriorityLevel;
  label: string;
  value?: number;
  source_tool: string;
};

type PropertyScorecard = {
  property_id: string;
  property_name: string;
  risk_score: number;
  risk_level: RiskLevel;
  unit_count: number;
  occupied_count: number;
  vacant_count: number;
  occupancy_pct: number;
  delinquency_total: number;
  open_work_order_count: number;
  urgent_work_order_count: number;
  stale_work_order_count: number;
  unassigned_work_order_count: number;
  loss_to_lease: number;
  lease_expirations_60d: number;
  top_risk: string;
  recommended_focus: string;
  risk_factors: RiskFactor[];
  url?: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inScope(scopeId: string, propertyId: string): boolean {
  if (scopeId === "portfolio") return true;
  if (scopeId === "port_tx") return properties.find((p) => p.property_id === propertyId)?.state === "TX";
  return scopeId === propertyId;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function money(n: number | undefined): number {
  return Math.round(n ?? 0);
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? round1((numerator / denominator) * 100) : 0;
}

function monthStart(date: string): string {
  return `${date.slice(0, 8)}01`;
}

function inclusiveMonthCount(periodStart: string, periodEnd: string): number {
  const [startYear, startMonth] = periodStart.split("-").map(Number);
  const [endYear, endMonth] = periodEnd.split("-").map(Number);
  const diff = (endYear - startYear) * 12 + (endMonth - startMonth) + 1;
  return Math.max(1, diff);
}

function resolvePeriod(asOfDate: string, periodStart?: string, periodEnd?: string) {
  return {
    period_start: periodStart ?? monthStart(asOfDate),
    period_end: periodEnd ?? asOfDate,
  };
}

function shouldUseLiveOperations(scopeId: string): boolean {
  return isLiveBackend() && !(reviewFixturesEnabled() && isReviewScopeId(scopeId));
}

function propertyMap(rows: Array<Pick<Property, "property_id" | "name">>) {
  return new Map(rows.map((p) => [p.property_id, p.name]));
}

function workOrderUrl(id: string) {
  return `https://app.proprietio.com/work-orders/${encodeURIComponent(id)}`;
}

function propertyUrl(id: string) {
  return `https://app.proprietio.com/properties/${encodeURIComponent(id)}`;
}

function leaseUrl(id: string) {
  return `https://app.proprietio.com/leases/${encodeURIComponent(id)}`;
}

function mockRentRoll(scopeId: string): RentRollSummary {
  const scopedUnits = units.filter((u) => inScope(scopeId, u.property_id));
  const occupied = scopedUnits.filter((u) => u.occupied);
  const contracted = occupied.reduce((sum, u) => sum + u.current_rent, 0);
  const market = scopedUnits.reduce((sum, u) => sum + u.market_rent, 0);

  return {
    unit_count: scopedUnits.length,
    occupied_count: occupied.length,
    occupancy_pct: scopedUnits.length ? round1((occupied.length / scopedUnits.length) * 100) : 0,
    contracted_monthly_rent: contracted,
    market_monthly_rent: market,
    loss_to_lease: market - contracted,
  };
}

function mockDelinquency(scopeId: string) {
  const scopedResidents = residents.filter((r) => r.balance_due > 0 && inScope(scopeId, r.property_id));
  const byProperty = new Map<string, number>();
  let total = 0;

  for (const resident of scopedResidents) {
    total += resident.balance_due;
    byProperty.set(
      resident.property_id,
      (byProperty.get(resident.property_id) ?? 0) + resident.balance_due,
    );
  }

  return {
    total,
    groups: Array.from(byProperty.entries()).map(([property_id, total_balance]) => ({
      property_id,
      property_name: properties.find((p) => p.property_id === property_id)?.name,
      total_balance,
    })),
  };
}

function mockData(scopeId: string): BriefData {
  const scopedProperties = properties.filter((p) => inScope(scopeId, p.property_id));
  const scopedWorkOrders = workOrders.filter((w) => inScope(scopeId, w.property_id));
  const delinquency = mockDelinquency(scopeId);

  return {
    properties: scopedProperties,
    rentRoll: mockRentRoll(scopeId),
    delinquencyTotal: delinquency.total,
    delinquencyGroups: delinquency.groups,
    workOrders: scopedWorkOrders.filter((w) => !["completed", "cancelled"].includes(w.status)),
    leases: leases.filter((l) => inScope(scopeId, l.property_id) && l.status === "active"),
    units: units.filter((u) => inScope(scopeId, u.property_id)),
  };
}

async function liveData(scopeId: string, asOfDate: string): Promise<BriefData> {
  const propertyFilter = scopeId.startsWith("prop_") ? scopeId : undefined;
  const [
    propertyResult,
    rentRoll,
    delinquency,
    openWorkOrders,
    assignedWorkOrders,
    inProgressWorkOrders,
  ] = await Promise.all([
    rentaly.searchProperties({}),
    rentaly.getRentRoll({ scope_id: scopeId, as_of_date: asOfDate }),
    rentaly.getDelinquency({ scope_id: scopeId, as_of_date: asOfDate, group_by: "property" }),
    rentaly.searchWorkOrders({ property_id: propertyFilter, status: "open" }),
    rentaly.searchWorkOrders({ property_id: propertyFilter, status: "assigned" }),
    rentaly.searchWorkOrders({ property_id: propertyFilter, status: "in_progress" }),
  ]);

  const visibleProperties = (propertyResult.properties as Property[]).filter((p) =>
    propertyFilter ? p.property_id === propertyFilter : true,
  );
  const workOrderRows = [
    ...(openWorkOrders.work_orders as WorkOrder[]),
    ...(assignedWorkOrders.work_orders as WorkOrder[]),
    ...(inProgressWorkOrders.work_orders as WorkOrder[]),
  ];

  return {
    properties: visibleProperties,
    rentRoll: {
      unit_count: rentRoll.unit_count ?? 0,
      occupied_count: rentRoll.occupied_count ?? 0,
      occupancy_pct: rentRoll.occupancy_pct ?? 0,
      contracted_monthly_rent: money(rentRoll.contracted_monthly_rent),
      market_monthly_rent: money(rentRoll.market_monthly_rent),
      loss_to_lease: money(rentRoll.loss_to_lease),
    },
    delinquencyTotal: money(delinquency.totals?.total),
    delinquencyGroups: (delinquency.groups ?? []) as DelinquencyGroup[],
    workOrders: workOrderRows,
    rentRollRows: ((rentRoll.rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      property_id: String(row.property_id ?? ""),
      occupied: Boolean(row.occupied),
      current_rent: money(numberValue(row.current_rent)),
      market_rent: money(numberValue(row.market_rent)),
    })),
  };
}

function operationsData(scopeId: string, asOfDate: string): Promise<BriefData> | BriefData {
  return shouldUseLiveOperations(scopeId) ? liveData(scopeId, asOfDate) : mockData(scopeId);
}

function daysUntil(date: string, asOfDate: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = Date.parse(`${asOfDate}T00:00:00Z`);
  const end = Date.parse(`${date}T00:00:00Z`);
  return Math.ceil((end - start) / msPerDay);
}

function severityRank(priority: PriorityLevel): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[priority];
}

function workOrderPriority(workOrder: WorkOrder): PriorityLevel {
  if (workOrder.priority === "emergency") return "critical";
  if (workOrder.priority === "high" || workOrder.days_open >= 30) return "high";
  if (workOrder.days_open >= 7 || workOrder.assigned_vendor_id === null) return "medium";
  return "low";
}

function buildPriorities(data: BriefData, asOfDate: string, includeLinks: boolean): BriefPriority[] {
  const priorities: BriefPriority[] = [];
  const names = propertyMap(data.properties);

  for (const workOrder of data.workOrders) {
    const propertyName = names.get(workOrder.property_id) ?? workOrder.property_id;
    const level = workOrderPriority(workOrder);
    const needsVendor = workOrder.assigned_vendor_id === null;
    priorities.push({
      priority: level,
      category: "maintenance",
      title: `${propertyName}: ${workOrder.priority} ${workOrder.category} work order`,
      reason: `${workOrder.status}, ${workOrder.days_open} day(s) open${needsVendor ? ", no vendor assigned" : ""}.`,
      recommended_next_action: needsVendor
        ? "Assign an approved vendor or update the work order with next steps."
        : "Check the vendor status and close it once the resolution is confirmed.",
      source_tool: "proprietio_get_work_order",
      source_id: workOrder.work_order_id,
      ...(includeLinks ? { url: workOrderUrl(workOrder.work_order_id) } : {}),
    });
  }

  for (const group of data.delinquencyGroups) {
    const balance = money(group.total_balance);
    if (balance <= 0) continue;
    const propertyName = group.property_name ?? (group.property_id ? names.get(group.property_id) : undefined) ?? "Property";
    priorities.push({
      priority: balance >= 5000 ? "high" : "medium",
      category: "delinquency",
      title: `${propertyName}: $${balance.toLocaleString("en-US")} delinquency`,
      reason: "Outstanding resident balances are reducing expected collections.",
      recommended_next_action: "Review delinquency by resident, then send payment reminders only after confirming recipients.",
      source_tool: "proprietio_get_delinquency",
      source_id: group.property_id,
      ...(includeLinks && group.property_id ? { url: propertyUrl(group.property_id) } : {}),
    });
  }

  const vacantCount = data.rentRoll.unit_count - data.rentRoll.occupied_count;
  if (vacantCount > 0) {
    priorities.push({
      priority: vacantCount >= 3 ? "high" : "medium",
      category: "leasing",
      title: `${vacantCount} vacant unit(s) across the scope`,
      reason: `Occupancy is ${data.rentRoll.occupancy_pct}%.`,
      recommended_next_action: "Review vacant units, pricing, and any turnover work orders blocking leasing.",
      source_tool: "proprietio_get_rent_roll",
    });
  }

  if (data.rentRoll.loss_to_lease > 0) {
    priorities.push({
      priority: data.rentRoll.loss_to_lease >= 1000 ? "medium" : "low",
      category: "revenue",
      title: `$${money(data.rentRoll.loss_to_lease).toLocaleString("en-US")} monthly loss-to-lease`,
      reason: "Current contracted rent is below market rent for the selected scope.",
      recommended_next_action: "Review rent roll and renewal pricing before the next leasing cycle.",
      source_tool: "proprietio_get_rent_roll",
    });
  }

  if (data.leases) {
    for (const lease of data.leases) {
      const days = daysUntil(lease.end_date, asOfDate);
      if (days < 0 || days > 60) continue;
      const unit = data.units?.find((u) => u.unit_id === lease.unit_id);
      const propertyName = names.get(lease.property_id) ?? lease.property_id;
      priorities.push({
        priority: days <= 30 ? "high" : "medium",
        category: "leasing",
        title: `${propertyName}${unit ? ` unit ${unit.unit_number}` : ""}: lease expires in ${days} day(s)`,
        reason: `Lease ${lease.lease_id} ends on ${lease.end_date}.`,
        recommended_next_action: "Prepare renewal terms or a turnover plan.",
        source_tool: "proprietio_get_lease",
        source_id: lease.lease_id,
        ...(includeLinks ? { url: leaseUrl(lease.lease_id) } : {}),
      });
    }
  }

  return priorities.sort((a, b) => {
    const severity = severityRank(b.priority) - severityRank(a.priority);
    if (severity !== 0) return severity;
    return a.title.localeCompare(b.title);
  });
}

function riskLevel(score: number): RiskLevel {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  if (score >= 15) return "low";
  return "healthy";
}

function trendForRisk(level: RiskLevel): KpiTrend {
  if (["critical", "high"].includes(level)) return "risk";
  if (level === "medium") return "watch";
  return "good";
}

function formatUsd(amount: number): string {
  return `$${money(amount).toLocaleString("en-US")}`;
}

function topPriorityLabel(priority: PriorityLevel): string {
  return {
    critical: "today",
    high: "today",
    medium: "this_week",
    low: "watchlist",
  }[priority];
}

function ownerRole(category: BriefPriority["category"]): string {
  return {
    maintenance: "property_manager",
    delinquency: "accounting",
    leasing: "leasing",
    revenue: "asset_manager",
  }[category];
}

function propertyRiskFactors(
  property: Property,
  data: BriefData,
  asOfDate: string,
): {
  score: number;
  factors: RiskFactor[];
  metrics: Omit<
    PropertyScorecard,
    "property_id" | "property_name" | "risk_score" | "risk_level" | "top_risk" | "recommended_focus" | "risk_factors" | "url"
  >;
} {
  const propUnits = data.units?.filter((u) => u.property_id === property.property_id);
  const propRentRows = propUnits ? undefined : data.rentRollRows?.filter((u) => u.property_id === property.property_id);
  const unitCount = propUnits?.length ?? propRentRows?.length ?? property.unit_count;
  const occupiedCount = propUnits
    ? propUnits.filter((u) => u.occupied).length
    : propRentRows
      ? propRentRows.filter((u) => u.occupied).length
    : data.properties.length === 1
      ? data.rentRoll.occupied_count
      : Math.round(unitCount * (data.rentRoll.occupancy_pct / 100));
  const vacantCount = Math.max(0, unitCount - occupiedCount);
  const contractedRent = propUnits
    ? propUnits.filter((u) => u.occupied).reduce((sum, u) => sum + u.current_rent, 0)
    : propRentRows
      ? propRentRows.filter((u) => u.occupied).reduce((sum, u) => sum + u.current_rent, 0)
    : data.properties.length === 1
      ? data.rentRoll.contracted_monthly_rent
      : 0;
  const marketRent = propUnits
    ? propUnits.reduce((sum, u) => sum + u.market_rent, 0)
    : propRentRows
      ? propRentRows.reduce((sum, u) => sum + u.market_rent, 0)
    : data.properties.length === 1
      ? data.rentRoll.market_monthly_rent
      : 0;
  const lossToLease = Math.max(0, marketRent - contractedRent);
  const propertyWorkOrders = data.workOrders.filter((w) => w.property_id === property.property_id);
  const urgentWorkOrders = propertyWorkOrders.filter((w) => ["emergency", "high"].includes(w.priority)).length;
  const emergencyWorkOrders = propertyWorkOrders.filter((w) => w.priority === "emergency").length;
  const staleWorkOrders = propertyWorkOrders.filter((w) => w.days_open >= 7).length;
  const unassignedWorkOrders = propertyWorkOrders.filter((w) => w.assigned_vendor_id === null).length;
  const delinquencyTotal = money(
    data.delinquencyGroups.find((g) => g.property_id === property.property_id)?.total_balance,
  );
  const leaseExpirations60d = data.leases?.filter((lease) => {
    if (lease.property_id !== property.property_id) return false;
    const days = daysUntil(lease.end_date, asOfDate);
    return days >= 0 && days <= 60;
  }).length ?? 0;
  const factors: RiskFactor[] = [];

  if (emergencyWorkOrders > 0) {
    factors.push({
      category: "maintenance",
      severity: "critical",
      label: `${emergencyWorkOrders} emergency work order(s) active`,
      value: emergencyWorkOrders,
      source_tool: "proprietio_search_work_orders",
    });
  } else if (urgentWorkOrders > 0) {
    factors.push({
      category: "maintenance",
      severity: "high",
      label: `${urgentWorkOrders} high-priority work order(s) active`,
      value: urgentWorkOrders,
      source_tool: "proprietio_search_work_orders",
    });
  }

  if (staleWorkOrders > 0) {
    factors.push({
      category: "maintenance",
      severity: staleWorkOrders >= 2 ? "high" : "medium",
      label: `${staleWorkOrders} work order(s) open 7+ days`,
      value: staleWorkOrders,
      source_tool: "proprietio_search_work_orders",
    });
  }

  if (unassignedWorkOrders > 0) {
    factors.push({
      category: "maintenance",
      severity: "medium",
      label: `${unassignedWorkOrders} work order(s) need vendor assignment`,
      value: unassignedWorkOrders,
      source_tool: "proprietio_search_work_orders",
    });
  }

  if (delinquencyTotal > 0) {
    factors.push({
      category: "delinquency",
      severity: delinquencyTotal >= 7500 ? "critical" : delinquencyTotal >= 5000 ? "high" : "medium",
      label: `${formatUsd(delinquencyTotal)} delinquency balance`,
      value: delinquencyTotal,
      source_tool: "proprietio_get_delinquency",
    });
  }

  if (vacantCount > 0) {
    factors.push({
      category: "leasing",
      severity: vacantCount >= 2 ? "high" : "medium",
      label: `${vacantCount} vacant unit(s)`,
      value: vacantCount,
      source_tool: "proprietio_get_rent_roll",
    });
  }

  if (lossToLease > 0) {
    factors.push({
      category: "revenue",
      severity: lossToLease >= 2500 ? "high" : lossToLease >= 1000 ? "medium" : "low",
      label: `${formatUsd(lossToLease)} monthly loss-to-lease`,
      value: lossToLease,
      source_tool: "proprietio_get_rent_roll",
    });
  }

  if (leaseExpirations60d > 0) {
    factors.push({
      category: "leasing",
      severity: leaseExpirations60d >= 2 ? "high" : "medium",
      label: `${leaseExpirations60d} lease(s) expire in 60 days`,
      value: leaseExpirations60d,
      source_tool: "proprietio_get_lease",
    });
  }

  const score = Math.min(100, Math.round(
    emergencyWorkOrders * 30
    + (urgentWorkOrders - emergencyWorkOrders) * 22
    + staleWorkOrders * 10
    + unassignedWorkOrders * 8
    + Math.min(25, delinquencyTotal / 500)
    + vacantCount * 10
    + Math.min(12, lossToLease / 200)
    + leaseExpirations60d * 5,
  ));

  return {
    score,
    factors: factors.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)),
    metrics: {
      unit_count: unitCount,
      occupied_count: occupiedCount,
      vacant_count: vacantCount,
      occupancy_pct: pct(occupiedCount, unitCount),
      delinquency_total: delinquencyTotal,
      open_work_order_count: propertyWorkOrders.length,
      urgent_work_order_count: urgentWorkOrders,
      stale_work_order_count: staleWorkOrders,
      unassigned_work_order_count: unassignedWorkOrders,
      loss_to_lease: lossToLease,
      lease_expirations_60d: leaseExpirations60d,
    },
  };
}

function recommendedFocus(factors: RiskFactor[]): string {
  const categories = new Set(factors.map((f) => f.category));
  if (factors.some((f) => f.severity === "critical" && f.category === "maintenance")) {
    return "Stabilize emergency maintenance first, then confirm resident impact and vendor ETA.";
  }
  if (categories.has("delinquency") && categories.has("maintenance")) {
    return "Run collections and maintenance follow-up in parallel before the next owner update.";
  }
  if (categories.has("delinquency")) {
    return "Prioritize collections review and payment-plan outreach after confirming balances.";
  }
  if (categories.has("leasing")) {
    return "Prioritize vacancy, renewal, and turnover coordination.";
  }
  if (categories.has("revenue")) {
    return "Review renewal pricing and market rent gaps.";
  }
  return "No urgent intervention; keep this property on the weekly watchlist.";
}

function buildScorecards(data: BriefData, asOfDate: string, includeLinks: boolean): PropertyScorecard[] {
  return data.properties
    .map((property) => {
      const risk = propertyRiskFactors(property, data, asOfDate);
      const level = riskLevel(risk.score);
      const topRisk = risk.factors[0]?.label ?? "No material risk detected";
      return {
        property_id: property.property_id,
        property_name: property.name,
        risk_score: risk.score,
        risk_level: level,
        ...risk.metrics,
        top_risk: topRisk,
        recommended_focus: recommendedFocus(risk.factors),
        risk_factors: risk.factors,
        ...(includeLinks ? { url: propertyUrl(property.property_id) } : {}),
      };
    })
    .sort((a, b) => {
      const score = b.risk_score - a.risk_score;
      if (score !== 0) return score;
      return a.property_name.localeCompare(b.property_name);
    });
}

function buildActionQueue(priorities: BriefPriority[], maxActions: number) {
  return priorities.slice(0, maxActions).map((priority, index) => ({
    action_id: `action_${String(index + 1).padStart(3, "0")}`,
    due: topPriorityLabel(priority.priority),
    owner_role: ownerRole(priority.category),
    urgency_score: severityRank(priority.priority) * 25,
    ...priority,
  }));
}

function buildKpis(data: BriefData, scorecards: PropertyScorecard[]) {
  const vacantUnits = data.rentRoll.unit_count - data.rentRoll.occupied_count;
  const urgentWorkOrders = data.workOrders.filter((w) => ["emergency", "high"].includes(w.priority)).length;
  const elevatedProperties = scorecards.filter((s) => ["critical", "high", "medium"].includes(s.risk_level)).length;
  const highestRisk = scorecards[0]?.risk_level ?? "healthy";

  return [
    {
      id: "occupancy",
      label: "Occupancy",
      value: data.rentRoll.occupancy_pct,
      unit: "percent",
      trend: data.rentRoll.occupancy_pct >= 95 ? "good" : data.rentRoll.occupancy_pct >= 90 ? "watch" : "risk",
      explanation: `${data.rentRoll.occupied_count}/${data.rentRoll.unit_count} units occupied; ${vacantUnits} vacant.`,
    },
    {
      id: "delinquency",
      label: "Delinquency",
      value: money(data.delinquencyTotal),
      unit: "usd",
      trend: data.delinquencyTotal >= 10000 ? "risk" : data.delinquencyTotal > 0 ? "watch" : "good",
      explanation: `${formatUsd(data.delinquencyTotal)} outstanding across the selected scope.`,
    },
    {
      id: "maintenance_load",
      label: "Open Work Orders",
      value: data.workOrders.length,
      unit: "count",
      trend: urgentWorkOrders > 0 ? "risk" : data.workOrders.length > 0 ? "watch" : "good",
      explanation: `${urgentWorkOrders} urgent/high-priority item(s) need attention.`,
    },
    {
      id: "loss_to_lease",
      label: "Loss To Lease",
      value: money(data.rentRoll.loss_to_lease),
      unit: "usd_per_month",
      trend: data.rentRoll.loss_to_lease >= 1000 ? "watch" : "good",
      explanation: `${formatUsd(data.rentRoll.loss_to_lease)} monthly upside versus market rent.`,
    },
    {
      id: "risk_exposure",
      label: "Risk Exposure",
      value: elevatedProperties,
      unit: "properties",
      trend: trendForRisk(highestRisk),
      explanation: `${elevatedProperties}/${scorecards.length} property scorecard(s) are medium risk or higher.`,
    },
  ];
}

function buildFinancialSnapshot(data: BriefData, periodStart: string, periodEnd: string): FinancialSnapshot {
  const months = inclusiveMonthCount(periodStart, periodEnd);
  const contractedMonthlyRent = data.units
    ? data.units.filter((u) => u.occupied).reduce((sum, u) => sum + u.current_rent, 0)
    : data.rentRoll.contracted_monthly_rent;
  const rentalIncome = contractedMonthlyRent * months;
  const otherIncome = Math.round(rentalIncome * 0.04);
  const totalRevenue = rentalIncome + otherIncome;
  const operatingExpenses = Math.round(totalRevenue * 0.42);
  const noi = totalRevenue - operatingExpenses;

  return {
    months,
    total_revenue: totalRevenue,
    operating_expenses: operatingExpenses,
    noi,
    noi_margin_pct: totalRevenue ? round1((noi / totalRevenue) * 100) : 0,
  };
}

async function financialSnapshot(
  scopeId: string,
  periodStart: string,
  periodEnd: string,
  data: BriefData,
): Promise<FinancialSnapshot> {
  if (shouldUseLiveOperations(scopeId)) {
    const live = await rentaly.getNoi({ scope_id: scopeId, period_start: periodStart, period_end: periodEnd });
    const totalRevenue = money(numberValue(live.total_revenue));
    const operatingExpenses = money(numberValue(live.operating_expenses));
    const noi = money(numberValue(live.noi));
    const margin = numberValue(live.noi_margin_pct);
    return {
      months: Math.round(numberValue(live.months)) || inclusiveMonthCount(periodStart, periodEnd),
      total_revenue: totalRevenue,
      operating_expenses: operatingExpenses,
      noi,
      noi_margin_pct: margin || (totalRevenue ? round1((noi / totalRevenue) * 100) : 0),
    };
  }

  return buildFinancialSnapshot(data, periodStart, periodEnd);
}

function riskSummary(scorecards: PropertyScorecard[]) {
  const averageRiskScore = scorecards.length
    ? Math.round(scorecards.reduce((sum, s) => sum + s.risk_score, 0) / scorecards.length)
    : 0;
  const counts = scorecards.reduce<Record<RiskLevel, number>>((acc, s) => {
    acc[s.risk_level] += 1;
    return acc;
  }, { critical: 0, high: 0, medium: 0, low: 0, healthy: 0 });

  return {
    average_risk_score: averageRiskScore,
    highest_risk_property: scorecards[0]
      ? {
        property_id: scorecards[0].property_id,
        property_name: scorecards[0].property_name,
        risk_score: scorecards[0].risk_score,
        risk_level: scorecards[0].risk_level,
        top_risk: scorecards[0].top_risk,
      }
      : null,
    risk_level_counts: counts,
    elevated_property_count: counts.critical + counts.high + counts.medium,
  };
}

function radarBuckets(scorecards: PropertyScorecard[]) {
  const buckets = new Map<
    RiskFactor["category"],
    { score: number; count: number; top_factor: string | null; top_severity: PriorityLevel }
  >();
  for (const scorecard of scorecards) {
    for (const factor of scorecard.risk_factors) {
      const current = buckets.get(factor.category) ?? { score: 0, count: 0, top_factor: null, top_severity: "low" };
      current.score += severityRank(factor.severity) * 10;
      current.count += 1;
      if (!current.top_factor || severityRank(factor.severity) > severityRank(current.top_severity)) {
        current.top_factor = factor.label;
        current.top_severity = factor.severity;
      }
      buckets.set(factor.category, current);
    }
  }

  return Array.from(buckets.entries())
    .map(([category, bucket]) => ({
      category,
      risk_score: Math.min(100, bucket.score),
      signal_count: bucket.count,
      top_factor: bucket.top_factor,
    }))
    .sort((a, b) => b.risk_score - a.risk_score);
}

function buildOwnerEmail(
  tone: "executive" | "friendly" | "board",
  periodStart: string,
  periodEnd: string,
  data: BriefData,
  financials: FinancialSnapshot,
  scorecards: PropertyScorecard[],
  actionQueue: ReturnType<typeof buildActionQueue>,
): string {
  const scopeLabel = data.properties.length === 1 ? data.properties[0].name : "the portfolio";
  const greeting = tone === "board" ? "Dear ownership team," : tone === "friendly" ? "Hi team," : "Hello,";
  const topProperty = scorecards[0];
  const headline = `${scopeLabel} closed ${periodStart} to ${periodEnd} at ${data.rentRoll.occupancy_pct}% occupancy, ${formatUsd(financials.noi)} NOI, and ${formatUsd(data.delinquencyTotal)} delinquency.`;
  const focus = topProperty
    ? `The main operating focus is ${topProperty.property_name}: ${topProperty.top_risk.toLowerCase()}.`
    : "No material operating issues are flagged.";
  const plan = actionQueue.slice(0, 3).map((a, index) => `${index + 1}. ${a.title} - ${a.recommended_next_action}`).join("\n");

  return [
    greeting,
    "",
    headline,
    "",
    focus,
    `Open maintenance stands at ${data.workOrders.length} item(s), including ${data.workOrders.filter((w) => ["emergency", "high"].includes(w.priority)).length} urgent/high-priority item(s). Monthly loss-to-lease is ${formatUsd(data.rentRoll.loss_to_lease)}.`,
    "",
    plan ? `Next actions:\n${plan}` : "Next actions: keep monitoring the weekly operating cadence.",
    "",
    "Best,",
    "Proprietio",
  ].join("\n");
}

export const operationsTools: ToolDefinition[] = [
  {
    name: "proprietio_get_daily_brief",
    title: "Get Daily Operations Brief",
    description:
      "Generate a prioritized daily operating brief for a property or portfolio: delinquency, urgent/stale maintenance, vacancy, loss-to-lease, and recommended next actions. Read-only; does not expose resident contact info.",
    inputSchema: GetDailyBriefInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    annotationRationale:
      "Aggregates read-only portfolio, accounting, and maintenance data into a daily priority brief. It never writes, sends messages, or fetches the open web. Repeated calls for the same scope/date return the same snapshot aside from live backend data changes.",
    handler: async (args) => {
      const asOfDate = args.as_of_date ?? todayIso();
      const data = await operationsData(args.scope_id, asOfDate);
      const priorities = buildPriorities(data, asOfDate, args.include_links);
      const staleWorkOrders = data.workOrders.filter((w) => w.days_open >= 7).length;
      const urgentWorkOrders = data.workOrders.filter((w) => ["emergency", "high"].includes(w.priority)).length;
      const unassignedWorkOrders = data.workOrders.filter((w) => w.assigned_vendor_id === null).length;
      const vacantUnits = data.rentRoll.unit_count - data.rentRoll.occupied_count;

      return {
        scope_id: args.scope_id,
        as_of_date: asOfDate,
        generated_at: `${asOfDate}T00:00:00.000Z`,
        headline: priorities.length
          ? `${priorities.length} priority item(s): ${urgentWorkOrders} urgent work order(s), $${money(data.delinquencyTotal).toLocaleString("en-US")} delinquency, ${vacantUnits} vacant unit(s).`
          : "No urgent operating priorities found for this scope.",
        portfolio: {
          property_count: data.properties.length,
          unit_count: data.rentRoll.unit_count,
          occupied_count: data.rentRoll.occupied_count,
          vacant_count: vacantUnits,
          occupancy_pct: data.rentRoll.occupancy_pct,
          contracted_monthly_rent: data.rentRoll.contracted_monthly_rent,
          market_monthly_rent: data.rentRoll.market_monthly_rent,
          loss_to_lease: data.rentRoll.loss_to_lease,
        },
        risk_summary: {
          delinquency_total: data.delinquencyTotal,
          delinquency_hotspots: data.delinquencyGroups
            .filter((g) => money(g.total_balance) > 0)
            .sort((a, b) => money(b.total_balance) - money(a.total_balance))
            .slice(0, 5)
            .map((g) => ({
              property_id: g.property_id,
              property_name: g.property_name ?? (g.property_id ? propertyMap(data.properties).get(g.property_id) : undefined),
              total_balance: money(g.total_balance),
            })),
          open_work_order_count: data.workOrders.length,
          urgent_work_order_count: urgentWorkOrders,
          stale_work_order_count: staleWorkOrders,
          unassigned_work_order_count: unassignedWorkOrders,
          vacant_unit_count: vacantUnits,
        },
        priorities: priorities.slice(0, args.max_items),
        suggested_followups: [
          "Show me the delinquency aging grouped by resident for this scope.",
          "Show me the stale work orders and which vendor is assigned.",
          "Draft resident or vendor messages, then ask me to confirm before sending.",
        ],
      };
    },
  },
  {
    name: "proprietio_get_command_center",
    title: "Get Operations Command Center",
    description:
      "Builds a command-center snapshot for a property or portfolio: KPI tiles, ranked property risk scorecards, prioritized action queue, and safe follow-up prompts. Read-only; does not expose resident contact info.",
    inputSchema: GetCommandCenterInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    annotationRationale:
      "Aggregates existing read-only property, accounting, and maintenance data into a structured command-center view. It never mutates data, sends messages, or reaches the open web; repeated calls with the same inputs return the same snapshot aside from live backend data changes.",
    handler: async (args) => {
      const asOfDate = args.as_of_date ?? todayIso();
      const period = resolvePeriod(asOfDate, args.period_start, args.period_end);
      const data = await operationsData(args.scope_id, asOfDate);
      const priorities = buildPriorities(data, asOfDate, args.include_links);
      const actionQueue = buildActionQueue(priorities, args.max_actions);
      const scorecards = buildScorecards(data, asOfDate, args.include_links);
      const summary = riskSummary(scorecards);

      return {
        scope_id: args.scope_id,
        as_of_date: asOfDate,
        period_start: period.period_start,
        period_end: period.period_end,
        generated_at: `${asOfDate}T00:00:00.000Z`,
        version: "3.0.0",
        headline: summary.highest_risk_property
          ? `Command center: ${summary.elevated_property_count} elevated property scorecard(s); top focus is ${summary.highest_risk_property.property_name} (${summary.highest_risk_property.top_risk}).`
          : "Command center: no material operating risks detected.",
        kpis: buildKpis(data, scorecards),
        portfolio: {
          property_count: data.properties.length,
          unit_count: data.rentRoll.unit_count,
          occupied_count: data.rentRoll.occupied_count,
          vacant_count: data.rentRoll.unit_count - data.rentRoll.occupied_count,
          occupancy_pct: data.rentRoll.occupancy_pct,
          delinquency_total: data.delinquencyTotal,
          open_work_order_count: data.workOrders.length,
          loss_to_lease: data.rentRoll.loss_to_lease,
        },
        risk_summary: summary,
        property_scorecards: scorecards,
        action_queue: actionQueue,
        ui_model: {
          presentation: "operations_command_center",
          cards: scorecards.slice(0, 5).map((scorecard) => ({
            id: scorecard.property_id,
            title: scorecard.property_name,
            badge: scorecard.risk_level,
            score: scorecard.risk_score,
            primary_metric: scorecard.top_risk,
            secondary_metrics: [
              `${scorecard.occupancy_pct}% occupied`,
              `${formatUsd(scorecard.delinquency_total)} delinquency`,
              `${scorecard.open_work_order_count} open work order(s)`,
            ],
          })),
          primary_actions: actionQueue.slice(0, 5).map((action) => ({
            id: action.action_id,
            title: action.title,
            due: action.due,
            owner_role: action.owner_role,
          })),
        },
        suggested_followups: [
          "Show me the risk radar for only critical and elevated properties.",
          "Create an owner update for this portfolio for the current month.",
          "Show the source work orders behind the top maintenance risk.",
        ],
      };
    },
  },
  {
    name: "proprietio_get_owner_update",
    title: "Generate Owner Update",
    description:
      "Generates a copy-ready owner or investor update for a property or portfolio, combining NOI, occupancy, delinquency, maintenance risk, and a recommended action plan. Read-only; no resident contact info.",
    inputSchema: GetOwnerUpdateInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    annotationRationale:
      "Reads portfolio, accounting, and maintenance data, then formats a summary and action plan. It does not write records, send messages, or access the open web; repeated calls with the same inputs are idempotent aside from live backend data changes.",
    handler: async (args) => {
      const asOfDate = args.as_of_date ?? todayIso();
      const period = resolvePeriod(asOfDate, args.period_start, args.period_end);
      const data = await operationsData(args.scope_id, asOfDate);
      const [financials] = await Promise.all([
        financialSnapshot(args.scope_id, period.period_start, period.period_end, data),
      ]);
      const priorities = buildPriorities(data, asOfDate, true);
      const actionQueue = buildActionQueue(priorities, 8);
      const scorecards = buildScorecards(data, asOfDate, true);
      const topScorecard = scorecards[0];
      const highlights = [
        `${data.rentRoll.occupancy_pct}% occupancy across ${data.rentRoll.unit_count} unit(s).`,
        `${formatUsd(financials.noi)} NOI on ${formatUsd(financials.total_revenue)} revenue for the selected period.`,
        `${formatUsd(data.rentRoll.loss_to_lease)} monthly loss-to-lease identified for revenue follow-up.`,
      ];
      const concerns = [
        data.delinquencyTotal > 0 ? `${formatUsd(data.delinquencyTotal)} delinquency balance remains open.` : null,
        data.workOrders.length > 0 ? `${data.workOrders.length} open work order(s), including ${data.workOrders.filter((w) => ["emergency", "high"].includes(w.priority)).length} urgent/high item(s).` : null,
        topScorecard ? `Highest-risk property: ${topScorecard.property_name} (${topScorecard.top_risk}).` : null,
      ].filter(Boolean);
      const actionPlan = args.include_action_plan
        ? actionQueue.slice(0, 5).map((action) => ({
          action_id: action.action_id,
          priority: action.priority,
          title: action.title,
          owner_role: action.owner_role,
          recommended_next_action: action.recommended_next_action,
          source_tool: action.source_tool,
          source_id: action.source_id,
          url: action.url,
        }))
        : [];

      return {
        scope_id: args.scope_id,
        as_of_date: asOfDate,
        period_start: period.period_start,
        period_end: period.period_end,
        tone: args.tone,
        generated_at: `${asOfDate}T00:00:00.000Z`,
        financials,
        operations_summary: {
          property_count: data.properties.length,
          unit_count: data.rentRoll.unit_count,
          occupancy_pct: data.rentRoll.occupancy_pct,
          delinquency_total: data.delinquencyTotal,
          open_work_order_count: data.workOrders.length,
          elevated_property_count: riskSummary(scorecards).elevated_property_count,
        },
        owner_update: {
          subject: data.properties.length === 1
            ? `${data.properties[0].name} owner update: ${period.period_start} to ${period.period_end}`
            : `Portfolio owner update: ${period.period_start} to ${period.period_end}`,
          executive_summary: topScorecard
            ? `${formatUsd(financials.noi)} NOI, ${data.rentRoll.occupancy_pct}% occupancy, and top focus ${topScorecard.property_name}: ${topScorecard.top_risk}.`
            : `${formatUsd(financials.noi)} NOI and no material operating risks flagged.`,
          highlights,
          concerns,
          action_plan: actionPlan,
          copy_ready_email_body: buildOwnerEmail(
            args.tone,
            period.period_start,
            period.period_end,
            data,
            financials,
            scorecards,
            actionQueue,
          ),
        },
        source_tools: [
          "proprietio_get_rent_roll",
          "proprietio_get_delinquency",
          "proprietio_get_noi",
          "proprietio_search_work_orders",
        ],
      };
    },
  },
  {
    name: "proprietio_get_risk_radar",
    title: "Get Portfolio Risk Radar",
    description:
      "Returns ranked property risk scorecards and category-level radar signals for delinquency, maintenance, leasing, and revenue risk. Read-only; no resident contact info.",
    inputSchema: GetRiskRadarInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    annotationRationale:
      "Scores property risk using read-only portfolio, accounting, leasing, and maintenance signals. It does not mutate records, send messages, or access the open web; repeated calls with the same inputs are idempotent aside from live backend data changes.",
    handler: async (args) => {
      const asOfDate = args.as_of_date ?? todayIso();
      const data = await operationsData(args.scope_id, asOfDate);
      const scorecards = buildScorecards(data, asOfDate, args.include_links);
      const filteredScorecards = scorecards.filter((scorecard) => {
        if (args.risk_threshold === "critical") return scorecard.risk_level === "critical";
        if (args.risk_threshold === "elevated") return ["critical", "high", "medium"].includes(scorecard.risk_level);
        return true;
      }).slice(0, args.max_properties);

      return {
        scope_id: args.scope_id,
        as_of_date: asOfDate,
        generated_at: `${asOfDate}T00:00:00.000Z`,
        risk_threshold: args.risk_threshold,
        summary: riskSummary(scorecards),
        radar: radarBuckets(scorecards),
        property_scorecards: filteredScorecards,
        top_next_actions: buildActionQueue(buildPriorities(data, asOfDate, args.include_links), 5),
        suggested_followups: [
          "Explain why the top property has the highest risk score.",
          "Show the maintenance items behind this risk radar.",
          "Generate an owner update from this risk radar.",
        ],
      };
    },
  },
];
