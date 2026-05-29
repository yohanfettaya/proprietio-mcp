/**
 * Live smoke test — exercises the rentaly-client against the REAL rentaly
 * `/api/v1/*` backend. This bypasses the MCP HTTP layer and calls the client
 * methods directly, so it verifies the conversion point (auth, pagination,
 * cents→dollars, error mapping) against production data.
 *
 *   RENTALY_API_BASE_URL=https://app.proprietio.com/api \
 *   RENTALY_API_KEY=pk_live_… \
 *   npm run smoke
 *
 * Reads only by default. SMOKE_WRITES=1 exercises create work order. The
 * resident message path is gated separately behind SMOKE_MESSAGE=1 because it
 * sends a real message to a real resident — only enable it deliberately.
 */
import { rentaly } from "../src/api/rentaly-client.js";

function divider(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

function show(label: string, value: unknown) {
  console.log(`${label}:`, JSON.stringify(value, null, 2));
}

async function main() {
  if (!process.env.RENTALY_API_BASE_URL || !process.env.RENTALY_API_KEY) {
    console.error(
      "Set RENTALY_API_BASE_URL and RENTALY_API_KEY before running the live smoke test.",
    );
    process.exit(1);
  }

  divider("1. Search properties");
  const props = await rentaly.searchProperties({});
  console.log(`count = ${props.count}`);
  const firstProp = props.properties[0];
  if (!firstProp) {
    console.log("No properties returned — stopping (empty org?).");
    return;
  }
  show("first property", firstProp);

  divider("2. Get property (units + active leases)");
  const detail = await rentaly.getProperty({ property_id: firstProp.property_id });
  console.log(`units = ${detail.units.length}, active_leases = ${detail.active_leases.length}`);
  if (detail.units[0]) show("first unit (rents should be dollars)", detail.units[0]);

  divider("3. List units (occupancy)");
  const units = await rentaly.listUnits({ property_id: firstProp.property_id });
  console.log(`unit_count = ${units.unit_count}, occupancy_rate_pct = ${units.occupancy_rate_pct}`);

  divider("4. List residents");
  const residents = await rentaly.listResidents({ property_id: firstProp.property_id });
  console.log(`count = ${residents.count}`);
  const firstResident = residents.residents[0];
  if (firstResident) show("first resident (balance should be dollars)", firstResident);

  divider("5. Rent roll");
  const rentRoll = await rentaly.getRentRoll({ scope_id: firstProp.property_id });
  show("rent roll (money in dollars)", {
    contracted_monthly_rent: rentRoll.contracted_monthly_rent,
    market_monthly_rent: rentRoll.market_monthly_rent,
    loss_to_lease: rentRoll.loss_to_lease,
  });

  divider("6. Search work orders");
  const wos = await rentaly.searchWorkOrders({});
  console.log(`count = ${wos.count}`);
  if (wos.work_orders[0]) show("first work order", wos.work_orders[0]);

  divider("7. List vendors");
  const vendors = await rentaly.listVendors({});
  console.log(`count = ${vendors.count}`);

  if (process.env.SMOKE_WRITES === "1") {
    const writeUnit = detail.units[0];
    divider("8. Create work order (WRITE)");
    if (!writeUnit) {
      console.log("No unit available — skipping create.");
    } else {
      const created = await rentaly.createWorkOrder({
        property_id: firstProp.property_id,
        unit_id: writeUnit.unit_id,
        category: "general",
        priority: "low",
        description: "[smoke test] Please ignore — automated live smoke test.",
      });
      show("created work order", created);

      // Close it IMMEDIATELY so no zombie WO sits open in a real client's
      // queue. The resolution note is the searchable tag for the cutover.
      const closed = await rentaly.closeWorkOrder({
        work_order_id: created.work_order_id,
        resolution_notes: "smoke test for Phase 2 cutover, please ignore",
      });
      show("closed work order", closed);
    }

    divider("9. Send resident message (WRITE)");
    if (process.env.SMOKE_MESSAGE !== "1") {
      console.log("Skipped — set SMOKE_MESSAGE=1 to send a real message to a real resident.");
    } else if (!firstResident) {
      console.log("No resident available — skipping message.");
    } else {
      const sent = await rentaly.sendMessage({
        to_resident_id: firstResident.resident_id,
        subject: "[smoke test]",
        body: "Automated live smoke test — please ignore.",
      });
      show("sent message", sent);
    }
  } else {
    divider("Writes skipped");
    console.log("Set SMOKE_WRITES=1 to exercise create work order + resident message.");
  }

  divider("Live smoke test complete");
}

main().catch((err) => {
  console.error("\nSMOKE TEST FAILED:");
  console.error(err);
  process.exit(1);
});
