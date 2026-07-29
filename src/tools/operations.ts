/**
 * Operations cockpit tools (V2).
 */
import { GetDailyBriefInput, type Property, type Unit, type Lease, type Resident, type WorkOrder } from "../types.js";
import { properties, units, leases, residents, workOrders } from "../data/mock.js";
import { rentaly, isLiveBackend } from "../api/rentaly-client.js";
import type { ToolDefinition } from "./index.js";

type PriorityLevel = "critical" | "high" | "medium" | "low";

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

type BriefData = {
  properties: Property[];
  rentRoll: RentRollSummary;
  delinquencyTotal: number;
  delinquencyGroups: DelinquencyGroup[];
  workOrders: WorkOrder[];
  leases?: Lease[];
  units?: Unit[];
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
  };
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
      const data = isLiveBackend() ? await liveData(args.scope_id, asOfDate) : mockData(args.scope_id);
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
];
