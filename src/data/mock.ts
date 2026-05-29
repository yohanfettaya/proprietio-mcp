/**
 * Mock portfolio data for demo and tests.
 * Realistic Texas multifamily portfolio — 3 properties, ~10 units, leases, residents, work orders, vendors.
 */
import type {
  Property,
  Unit,
  Lease,
  Resident,
  WorkOrder,
  Vendor,
} from "../types.js";

export const properties: Property[] = [
  {
    property_id: "prop_001",
    name: "The Madison",
    address: "1200 E 6th St",
    city: "Austin",
    state: "TX",
    zip: "78702",
    unit_count: 4,
    year_built: 2018,
    acquired_date: "2024-03-15",
    owner: "Madison Holdings LLC",
    current_value: 4_200_000,
  },
  {
    property_id: "prop_002",
    name: "Riverbend Lofts",
    address: "455 Riverfront Blvd",
    city: "Dallas",
    state: "TX",
    zip: "75207",
    unit_count: 3,
    year_built: 2015,
    acquired_date: "2023-11-02",
    owner: "Riverbend Holdings LLC",
    current_value: 3_100_000,
  },
  {
    property_id: "prop_003",
    name: "Hill Country Commons",
    address: "8800 Broadway St",
    city: "San Antonio",
    state: "TX",
    zip: "78217",
    unit_count: 3,
    year_built: 2012,
    acquired_date: "2024-08-20",
    owner: "Hill Country Partners LP",
    current_value: 2_750_000,
  },
];

export const units: Unit[] = [
  // Madison
  { unit_id: "unit_101", property_id: "prop_001", unit_number: "101", bedrooms: 1, bathrooms: 1, sqft: 720, market_rent: 1850, current_rent: 1800, occupied: true, current_lease_id: "lease_a1" },
  { unit_id: "unit_102", property_id: "prop_001", unit_number: "102", bedrooms: 2, bathrooms: 2, sqft: 1050, market_rent: 2400, current_rent: 2350, occupied: true, current_lease_id: "lease_a2" },
  { unit_id: "unit_103", property_id: "prop_001", unit_number: "103", bedrooms: 2, bathrooms: 2, sqft: 1080, market_rent: 2450, current_rent: 2450, occupied: true, current_lease_id: "lease_a3" },
  { unit_id: "unit_104", property_id: "prop_001", unit_number: "104", bedrooms: 1, bathrooms: 1, sqft: 700, market_rent: 1800, current_rent: 0, occupied: false, current_lease_id: null },

  // Riverbend
  { unit_id: "unit_201", property_id: "prop_002", unit_number: "201", bedrooms: 2, bathrooms: 2, sqft: 1200, market_rent: 2200, current_rent: 2150, occupied: true, current_lease_id: "lease_b1" },
  { unit_id: "unit_202", property_id: "prop_002", unit_number: "202", bedrooms: 1, bathrooms: 1, sqft: 850, market_rent: 1700, current_rent: 1700, occupied: true, current_lease_id: "lease_b2" },
  { unit_id: "unit_203", property_id: "prop_002", unit_number: "203", bedrooms: 3, bathrooms: 2, sqft: 1500, market_rent: 2900, current_rent: 2850, occupied: true, current_lease_id: "lease_b3" },

  // Hill Country
  { unit_id: "unit_301", property_id: "prop_003", unit_number: "301", bedrooms: 2, bathrooms: 1, sqft: 950, market_rent: 1750, current_rent: 1700, occupied: true, current_lease_id: "lease_c1" },
  { unit_id: "unit_302", property_id: "prop_003", unit_number: "302", bedrooms: 2, bathrooms: 1, sqft: 970, market_rent: 1750, current_rent: 1750, occupied: true, current_lease_id: "lease_c2" },
  { unit_id: "unit_303", property_id: "prop_003", unit_number: "303", bedrooms: 1, bathrooms: 1, sqft: 680, market_rent: 1400, current_rent: 0, occupied: false, current_lease_id: null },
];

export const leases: Lease[] = [
  { lease_id: "lease_a1", unit_id: "unit_101", property_id: "prop_001", resident_ids: ["res_001"], start_date: "2025-06-01", end_date: "2026-05-31", monthly_rent: 1800, security_deposit: 1800, status: "active" },
  { lease_id: "lease_a2", unit_id: "unit_102", property_id: "prop_001", resident_ids: ["res_002", "res_003"], start_date: "2024-09-01", end_date: "2026-08-31", monthly_rent: 2350, security_deposit: 2350, status: "active" },
  { lease_id: "lease_a3", unit_id: "unit_103", property_id: "prop_001", resident_ids: ["res_004"], start_date: "2025-01-15", end_date: "2026-01-14", monthly_rent: 2450, security_deposit: 2450, status: "active" },

  { lease_id: "lease_b1", unit_id: "unit_201", property_id: "prop_002", resident_ids: ["res_005", "res_006"], start_date: "2024-11-01", end_date: "2026-10-31", monthly_rent: 2150, security_deposit: 2150, status: "active" },
  { lease_id: "lease_b2", unit_id: "unit_202", property_id: "prop_002", resident_ids: ["res_007"], start_date: "2025-03-01", end_date: "2026-02-28", monthly_rent: 1700, security_deposit: 1700, status: "active" },
  { lease_id: "lease_b3", unit_id: "unit_203", property_id: "prop_002", resident_ids: ["res_008", "res_009"], start_date: "2024-07-01", end_date: "2026-06-30", monthly_rent: 2850, security_deposit: 2850, status: "active" },

  { lease_id: "lease_c1", unit_id: "unit_301", property_id: "prop_003", resident_ids: ["res_010"], start_date: "2025-02-01", end_date: "2026-01-31", monthly_rent: 1700, security_deposit: 1700, status: "active" },
  { lease_id: "lease_c2", unit_id: "unit_302", property_id: "prop_003", resident_ids: ["res_011", "res_012"], start_date: "2024-10-01", end_date: "2026-09-30", monthly_rent: 1750, security_deposit: 1750, status: "active" },
];

export const residents: Resident[] = [
  { resident_id: "res_001", full_name: "Sarah Chen", email: "sarah.chen@example.com", phone: "+1-512-555-0101", unit_id: "unit_101", property_id: "prop_001", balance_due: 0 },
  { resident_id: "res_002", full_name: "Marcus Johnson", email: "m.johnson@example.com", phone: "+1-512-555-0102", unit_id: "unit_102", property_id: "prop_001", balance_due: 2350 },
  { resident_id: "res_003", full_name: "Elena Johnson", email: "elena.j@example.com", phone: "+1-512-555-0103", unit_id: "unit_102", property_id: "prop_001", balance_due: 0 },
  { resident_id: "res_004", full_name: "David Park", email: "d.park@example.com", phone: "+1-512-555-0104", unit_id: "unit_103", property_id: "prop_001", balance_due: 4900 },
  { resident_id: "res_005", full_name: "Aisha Williams", email: "aisha.w@example.com", phone: "+1-214-555-0201", unit_id: "unit_201", property_id: "prop_002", balance_due: 2150 },
  { resident_id: "res_006", full_name: "Tariq Williams", email: "tariq.w@example.com", phone: "+1-214-555-0202", unit_id: "unit_201", property_id: "prop_002", balance_due: 0 },
  { resident_id: "res_007", full_name: "Jamie Rodriguez", email: "j.rodriguez@example.com", phone: "+1-214-555-0203", unit_id: "unit_202", property_id: "prop_002", balance_due: 1700 },
  { resident_id: "res_008", full_name: "Priya Patel", email: "p.patel@example.com", phone: "+1-214-555-0204", unit_id: "unit_203", property_id: "prop_002", balance_due: 0 },
  { resident_id: "res_009", full_name: "Raj Patel", email: "r.patel@example.com", phone: "+1-214-555-0205", unit_id: "unit_203", property_id: "prop_002", balance_due: 0 },
  { resident_id: "res_010", full_name: "Anna Müller", email: "anna.m@example.com", phone: "+1-210-555-0301", unit_id: "unit_301", property_id: "prop_003", balance_due: 1700 },
  { resident_id: "res_011", full_name: "Carlos Reyes", email: "c.reyes@example.com", phone: "+1-210-555-0302", unit_id: "unit_302", property_id: "prop_003", balance_due: 0 },
  { resident_id: "res_012", full_name: "Lucia Reyes", email: "l.reyes@example.com", phone: "+1-210-555-0303", unit_id: "unit_302", property_id: "prop_003", balance_due: 0 },
];

export const vendors: Vendor[] = [
  { vendor_id: "vendor_001", name: "Lone Star Plumbing", trade: "plumbing", phone: "+1-512-555-9001", email: "dispatch@lonestarplumbing.com", rating: 4.7, approved: true },
  { vendor_id: "vendor_002", name: "Cool Breeze HVAC", trade: "hvac", phone: "+1-512-555-9002", email: "service@coolbreeze.com", rating: 4.5, approved: true },
  { vendor_id: "vendor_003", name: "Bright Spark Electric", trade: "electrical", phone: "+1-214-555-9003", email: "work@brightspark.com", rating: 4.8, approved: true },
  { vendor_id: "vendor_004", name: "Allstate Handy Pros", trade: "general", phone: "+1-210-555-9004", email: "ops@allstatehandy.com", rating: 4.3, approved: true },
  { vendor_id: "vendor_005", name: "QuickFix Maintenance", trade: "general", phone: "+1-512-555-9005", email: "info@quickfix.com", rating: 3.9, approved: false },
];

export const workOrders: WorkOrder[] = [
  {
    work_order_id: "wo_001", property_id: "prop_001", unit_id: "unit_102",
    category: "plumbing", priority: "high",
    status: "in_progress",
    description: "Leaking kitchen sink, water pooling under cabinet.",
    created_at: "2026-05-22T09:14:00Z", updated_at: "2026-05-26T11:00:00Z",
    assigned_vendor_id: "vendor_001", resolution_notes: null, days_open: 7,
  },
  {
    work_order_id: "wo_002", property_id: "prop_001", unit_id: "unit_104",
    category: "general", priority: "medium",
    status: "open",
    description: "Turnover prep: paint, deep clean, replace bedroom blinds.",
    created_at: "2026-05-15T16:30:00Z", updated_at: "2026-05-15T16:30:00Z",
    assigned_vendor_id: null, resolution_notes: null, days_open: 14,
  },
  {
    work_order_id: "wo_003", property_id: "prop_002", unit_id: "unit_201",
    category: "hvac", priority: "high",
    status: "assigned",
    description: "AC not cooling, vents blowing warm air. Tenant reports 85F inside.",
    created_at: "2026-05-28T07:45:00Z", updated_at: "2026-05-28T10:20:00Z",
    assigned_vendor_id: "vendor_002", resolution_notes: null, days_open: 1,
  },
  {
    work_order_id: "wo_004", property_id: "prop_002", unit_id: null,
    category: "general", priority: "low",
    status: "open",
    description: "Replace lobby light fixtures, swap to LED panels.",
    created_at: "2026-04-12T12:00:00Z", updated_at: "2026-04-12T12:00:00Z",
    assigned_vendor_id: null, resolution_notes: null, days_open: 47,
  },
  {
    work_order_id: "wo_005", property_id: "prop_003", unit_id: "unit_302",
    category: "electrical", priority: "medium",
    status: "completed",
    description: "Bathroom GFCI outlet keeps tripping.",
    created_at: "2026-05-08T14:20:00Z", updated_at: "2026-05-12T17:00:00Z",
    assigned_vendor_id: "vendor_003", resolution_notes: "Replaced GFCI outlet, tested all bathroom circuits. No further trips.",
    days_open: 4,
  },
  {
    work_order_id: "wo_006", property_id: "prop_003", unit_id: "unit_301",
    category: "plumbing", priority: "emergency",
    status: "in_progress",
    description: "Burst pipe in laundry closet, water shut off, tenant relocated to unit 303 temporarily.",
    created_at: "2026-05-29T05:12:00Z", updated_at: "2026-05-29T07:30:00Z",
    assigned_vendor_id: "vendor_001", resolution_notes: null, days_open: 0,
  },
];

/**
 * Simple counter used by createWorkOrder to mint fresh IDs in-process.
 * Not persisted across restarts — fine for a stateless demo.
 */
let _woCounter = 100;
export function nextWorkOrderId(): string {
  _woCounter += 1;
  return `wo_${String(_woCounter).padStart(3, "0")}`;
}
