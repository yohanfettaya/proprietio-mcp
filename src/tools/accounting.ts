/**
 * Accounting & GL tools (6).
 *
 * The mock numbers below are deterministic but loosely modelled on the
 * sample portfolio so totals roll up sensibly across tools.
 */
import {
  GetRentRollInput, GetDelinquencyInput, GetIncomeStatementInput,
  GetBalanceSheetInput, GetGeneralLedgerInput, GetNoiInput,
} from "../types.js";
import { properties, units, residents, leases } from "../data/mock.js";
import { rentaly, isLiveBackend } from "../api/rentaly-client.js";
import type { ToolDefinition } from "./index.js";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inScope(scopeId: string, propertyId: string): boolean {
  // Portfolio-level scope: 'port_tx' or 'portfolio' applies to all TX
  if (scopeId === "port_tx") {
    return properties.find(p => p.property_id === propertyId)?.state === "TX";
  }
  if (scopeId === "portfolio") return true;
  return scopeId === propertyId;
}

export const accountingTools: ToolDefinition[] = [
  {
    name: "proprietio_get_rent_roll",
    description:
      "Returns a rent roll snapshot: occupied units, contracted rent, market rent, and loss-to-lease for a property or portfolio.",
    inputSchema: GetRentRollInput,
    handler: (args) => {
      if (isLiveBackend()) return rentaly.getRentRoll(args);
      const asOf = args.as_of_date ?? todayIso();
      const inScopeUnits = units.filter(u => inScope(args.scope_id, u.property_id));
      const occupied = inScopeUnits.filter(u => u.occupied);
      const contractedRent = occupied.reduce((s, u) => s + u.current_rent, 0);
      const marketRent = inScopeUnits.reduce((s, u) => s + u.market_rent, 0);
      const lossToLease = marketRent - contractedRent;
      const rows = inScopeUnits.map(u => ({
        property_id: u.property_id,
        unit_id: u.unit_id,
        unit_number: u.unit_number,
        occupied: u.occupied,
        current_rent: u.current_rent,
        market_rent: u.market_rent,
      }));
      return {
        scope_id: args.scope_id,
        as_of_date: asOf,
        unit_count: inScopeUnits.length,
        occupied_count: occupied.length,
        occupancy_pct: inScopeUnits.length ? Math.round((occupied.length / inScopeUnits.length) * 1000) / 10 : 0,
        contracted_monthly_rent: contractedRent,
        market_monthly_rent: marketRent,
        loss_to_lease: lossToLease,
        rows,
      };
    },
  },
  {
    name: "proprietio_get_delinquency",
    description:
      "Delinquency aging report (0-30, 31-60, 61-90, 90+) for a property or portfolio. Groupable by property, unit, or resident.",
    inputSchema: GetDelinquencyInput,
    handler: (args) => {
      if (isLiveBackend()) return rentaly.getDelinquency(args);
      const asOf = args.as_of_date ?? todayIso();
      const delinquentResidents = residents.filter(r => r.balance_due > 0 && inScope(args.scope_id, r.property_id));

      // Deterministic bucketing: use last digit of resident_id to assign bucket
      const buckets = { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
      const detail: Array<Record<string, unknown>> = [];

      for (const r of delinquentResidents) {
        const lastChar = r.resident_id.slice(-1);
        const n = parseInt(lastChar, 10);
        let bucket: keyof typeof buckets;
        if (n <= 4) bucket = "0_30";
        else if (n <= 6) bucket = "31_60";
        else if (n <= 8) bucket = "61_90";
        else bucket = "90_plus";
        buckets[bucket] += r.balance_due;
        detail.push({
          resident_id: r.resident_id,
          full_name: r.full_name,
          property_id: r.property_id,
          unit_id: r.unit_id,
          balance: r.balance_due,
          bucket,
        });
      }

      const total = buckets["0_30"] + buckets["31_60"] + buckets["61_90"] + buckets["90_plus"];

      let grouped: Array<Record<string, unknown>> = [];
      if (args.group_by === "property") {
        const byProp = new Map<string, number>();
        for (const r of delinquentResidents) {
          byProp.set(r.property_id, (byProp.get(r.property_id) ?? 0) + r.balance_due);
        }
        grouped = Array.from(byProp.entries()).map(([pid, total]) => ({
          property_id: pid,
          property_name: properties.find(p => p.property_id === pid)?.name,
          total_balance: total,
        }));
      } else if (args.group_by === "unit") {
        const byUnit = new Map<string, number>();
        for (const r of delinquentResidents) {
          byUnit.set(r.unit_id, (byUnit.get(r.unit_id) ?? 0) + r.balance_due);
        }
        grouped = Array.from(byUnit.entries()).map(([uid, total]) => ({
          unit_id: uid,
          total_balance: total,
        }));
      } else {
        grouped = detail;
      }

      return {
        scope_id: args.scope_id,
        as_of_date: asOf,
        totals: { ...buckets, total },
        group_by: args.group_by,
        groups: grouped,
      };
    },
  },
  {
    name: "proprietio_get_income_statement",
    description:
      "Profit & loss for a property or portfolio over a date range. Returns revenue, operating expenses, NOI, and margins.",
    inputSchema: GetIncomeStatementInput,
    handler: (args) => {
      if (isLiveBackend()) return rentaly.getIncomeStatement(args);
      const inScopeProps = properties.filter(p => inScope(args.scope_id, p.property_id));
      // months in period (inclusive month buckets)
      const start = new Date(args.period_start);
      const end = new Date(args.period_end);
      const months = Math.max(1, Math.round(
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      ));

      const rentalIncome = inScopeProps.reduce((sum, p) => {
        const propUnits = units.filter(u => u.property_id === p.property_id && u.occupied);
        return sum + propUnits.reduce((s, u) => s + u.current_rent, 0) * months;
      }, 0);
      const otherIncome = Math.round(rentalIncome * 0.04);
      const totalRevenue = rentalIncome + otherIncome;
      const opex = Math.round(totalRevenue * 0.42);
      const noi = totalRevenue - opex;

      return {
        scope_id: args.scope_id,
        period_start: args.period_start,
        period_end: args.period_end,
        months,
        revenue: {
          rental_income: rentalIncome,
          other_income: otherIncome,
          total: totalRevenue,
        },
        operating_expenses: {
          property_management: Math.round(totalRevenue * 0.08),
          repairs_and_maintenance: Math.round(totalRevenue * 0.11),
          utilities: Math.round(totalRevenue * 0.06),
          insurance: Math.round(totalRevenue * 0.05),
          taxes: Math.round(totalRevenue * 0.09),
          other: Math.round(totalRevenue * 0.03),
          total: opex,
        },
        noi,
        noi_margin_pct: totalRevenue ? Math.round((noi / totalRevenue) * 1000) / 10 : 0,
      };
    },
  },
  {
    name: "proprietio_get_balance_sheet",
    description:
      "Balance sheet as of a date: total assets (real estate + cash), liabilities (mortgages), and equity.",
    inputSchema: GetBalanceSheetInput,
    handler: (args) => {
      if (isLiveBackend()) return rentaly.getBalanceSheet(args);
      const asOf = args.as_of_date ?? todayIso();
      const inScopeProps = properties.filter(p => inScope(args.scope_id, p.property_id));
      const realEstate = inScopeProps.reduce((s, p) => s + p.current_value, 0);
      const cash = Math.round(realEstate * 0.03);
      const totalAssets = realEstate + cash;
      const mortgages = Math.round(realEstate * 0.62);
      const accountsPayable = Math.round(realEstate * 0.005);
      const totalLiabilities = mortgages + accountsPayable;
      const equity = totalAssets - totalLiabilities;
      return {
        scope_id: args.scope_id,
        as_of_date: asOf,
        assets: { real_estate: realEstate, cash, total: totalAssets },
        liabilities: { mortgages, accounts_payable: accountsPayable, total: totalLiabilities },
        equity,
      };
    },
  },
  {
    name: "proprietio_get_general_ledger",
    description:
      "Returns GL entries for a scope, filtered by account and date range. Useful for transaction-level audits.",
    inputSchema: GetGeneralLedgerInput,
    handler: (args) => {
      if (isLiveBackend()) return rentaly.getGeneralLedger(args);
      const accounts = [
        "4000-Rental Income",
        "4100-Late Fees",
        "5000-Property Management",
        "5100-Repairs & Maintenance",
        "5200-Utilities",
        "5300-Insurance",
        "5400-Property Taxes",
      ];

      const entries: Array<Record<string, unknown>> = [];
      const start = new Date(args.period_start).getTime();
      const end = new Date(args.period_end).getTime();
      const inScopeProps = properties.filter(p => inScope(args.scope_id, p.property_id));

      for (let i = 0; i < args.limit; i += 1) {
        const acct = args.account ?? accounts[i % accounts.length];
        const property = inScopeProps[i % Math.max(1, inScopeProps.length)];
        if (!property) break;
        const ts = start + (end - start) * (i / args.limit);
        const isIncome = acct.startsWith("4");
        const amount = isIncome ? 1800 + (i % 5) * 75 : -(120 + (i % 7) * 35);
        entries.push({
          entry_id: `gl_${String(1000 + i)}`,
          date: new Date(ts).toISOString().slice(0, 10),
          account: acct,
          property_id: property.property_id,
          amount,
          description: isIncome ? "Rent payment received" : `${acct.split("-")[1] ?? "Expense"} invoice`,
        });
      }

      return {
        scope_id: args.scope_id,
        period_start: args.period_start,
        period_end: args.period_end,
        account_filter: args.account ?? null,
        entry_count: entries.length,
        entries,
      };
    },
  },
  {
    name: "proprietio_get_noi",
    description:
      "Net Operating Income for a property or portfolio over a date range. NOI = total revenue - operating expenses (excluding debt service & capex).",
    inputSchema: GetNoiInput,
    handler: (args) => {
      if (isLiveBackend()) return rentaly.getNoi(args);
      // Reuse income statement logic for consistency
      const inScopeProps = properties.filter(p => inScope(args.scope_id, p.property_id));
      const start = new Date(args.period_start);
      const end = new Date(args.period_end);
      const months = Math.max(1, Math.round(
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      ));
      const rentalIncome = inScopeProps.reduce((sum, p) => {
        const propUnits = units.filter(u => u.property_id === p.property_id && u.occupied);
        return sum + propUnits.reduce((s, u) => s + u.current_rent, 0) * months;
      }, 0);
      const otherIncome = Math.round(rentalIncome * 0.04);
      const totalRevenue = rentalIncome + otherIncome;
      const opex = Math.round(totalRevenue * 0.42);
      const noi = totalRevenue - opex;

      return {
        scope_id: args.scope_id,
        period_start: args.period_start,
        period_end: args.period_end,
        months,
        total_revenue: totalRevenue,
        operating_expenses: opex,
        noi,
        noi_margin_pct: totalRevenue ? Math.round((noi / totalRevenue) * 1000) / 10 : 0,
      };
    },
  },
];
