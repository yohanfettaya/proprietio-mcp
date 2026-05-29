/**
 * Properties & Leasing tools (5).
 */
import {
  SearchPropertiesInput, GetPropertyInput, ListUnitsInput,
  GetLeaseInput, ListResidentsInput,
} from "../types.js";
import { properties, units, leases, residents } from "../data/mock.js";
import type { ToolDefinition } from "./index.js";

export const propertyTools: ToolDefinition[] = [
  {
    name: "proprietio_search_properties",
    description:
      "Search the Proprietio portfolio by city, state, owner, or unit count. Returns a list of matching properties with summary details.",
    inputSchema: SearchPropertiesInput,
    handler: (args) => {
      let out = [...properties];
      if (args.city) out = out.filter(p => p.city.toLowerCase().includes(args.city!.toLowerCase()));
      if (args.state) out = out.filter(p => p.state === args.state);
      if (args.owner) out = out.filter(p => p.owner.toLowerCase().includes(args.owner!.toLowerCase()));
      if (args.min_units != null) out = out.filter(p => p.unit_count >= args.min_units!);
      if (args.max_units != null) out = out.filter(p => p.unit_count <= args.max_units!);
      return { count: out.length, properties: out };
    },
  },
  {
    name: "proprietio_get_property",
    description:
      "Get the full record for a single property, including its units and active leases.",
    inputSchema: GetPropertyInput,
    handler: (args) => {
      const property = properties.find(p => p.property_id === args.property_id);
      if (!property) throw new Error(`Property not found: ${args.property_id}`);
      const propertyUnits = units.filter(u => u.property_id === args.property_id);
      const activeLeases = leases.filter(l => l.property_id === args.property_id && l.status === "active");
      return { property, units: propertyUnits, active_leases: activeLeases };
    },
  },
  {
    name: "proprietio_list_units",
    description:
      "List all units in a property, with occupancy and current rent. Optionally filter to occupied units only.",
    inputSchema: ListUnitsInput,
    handler: (args) => {
      let out = units.filter(u => u.property_id === args.property_id);
      if (args.occupied_only) out = out.filter(u => u.occupied);
      const occupancyRate = out.length === 0 ? 0 :
        (out.filter(u => u.occupied).length / out.length) * 100;
      return {
        property_id: args.property_id,
        unit_count: out.length,
        occupancy_rate_pct: Math.round(occupancyRate * 10) / 10,
        units: out,
      };
    },
  },
  {
    name: "proprietio_get_lease",
    description:
      "Get full lease details: tenant, term, rent, deposit, and status.",
    inputSchema: GetLeaseInput,
    handler: (args) => {
      const lease = leases.find(l => l.lease_id === args.lease_id);
      if (!lease) throw new Error(`Lease not found: ${args.lease_id}`);
      const leaseResidents = residents.filter(r => lease.resident_ids.includes(r.resident_id));
      const unit = units.find(u => u.unit_id === lease.unit_id);
      return { lease, residents: leaseResidents, unit };
    },
  },
  {
    name: "proprietio_list_residents",
    description:
      "List residents for a property or a specific unit. Returns contact info and current balance due.",
    inputSchema: ListResidentsInput,
    handler: (args) => {
      let out = residents;
      if (args.unit_id) out = out.filter(r => r.unit_id === args.unit_id);
      else if (args.property_id) out = out.filter(r => r.property_id === args.property_id);
      return { count: out.length, residents: out };
    },
  },
];
