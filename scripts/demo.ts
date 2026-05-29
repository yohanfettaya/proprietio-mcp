/**
 * Demo client — calls the Proprietio MCP server over HTTP and prints
 * a few realistic tool calls. Use this to smoke-test or to demo to
 * Anthropic's review team.
 *
 *   Terminal A:  npm run dev
 *   Terminal B:  npm run demo
 */
const BASE = process.env.MCP_URL ?? "http://localhost:3030/mcp";
const TOKEN = process.env.DEMO_BEARER_TOKEN ?? "demo-anthropic-review-2026";

let rpcId = 0;

async function rpc(method: string, params: unknown) {
  const id = ++rpcId;
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  // The server replies as JSON for simple calls; SSE for streamed.
  // Strip SSE framing if present.
  const jsonChunk = text.startsWith("event:")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("")
    : text;
  return JSON.parse(jsonChunk);
}

function divider(title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

async function main() {
  divider("1. Initialize");
  const init = await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "proprietio-demo-client", version: "0.1.0" },
  });
  console.log(JSON.stringify(init.result?.serverInfo, null, 2));

  divider("2. List tools");
  const tools = await rpc("tools/list", {});
  const names = (tools.result?.tools ?? []).map((t: { name: string }) => t.name);
  console.log(`Registered ${names.length} tools:`);
  names.forEach((n: string) => console.log(`  - ${n}`));

  divider("3. Search Texas portfolio");
  const search = await rpc("tools/call", {
    name: "proprietio_search_properties",
    arguments: { state: "TX" },
  });
  console.log(search.result?.content?.[0]?.text);

  divider("4. Delinquency by property (TX portfolio)");
  const delinq = await rpc("tools/call", {
    name: "proprietio_get_delinquency",
    arguments: { scope_id: "port_tx", group_by: "property" },
  });
  console.log(delinq.result?.content?.[0]?.text);

  divider("5. Stale work orders (open > 7 days)");
  const stale = await rpc("tools/call", {
    name: "proprietio_search_work_orders",
    arguments: { status: "open", min_days_open: 7 },
  });
  console.log(stale.result?.content?.[0]?.text);

  divider("6. NOI for The Madison, May 2026");
  const noi = await rpc("tools/call", {
    name: "proprietio_get_noi",
    arguments: {
      scope_id: "prop_001",
      period_start: "2026-05-01",
      period_end: "2026-05-31",
    },
  });
  console.log(noi.result?.content?.[0]?.text);

  divider("7. Create a work order (WRITE)");
  const create = await rpc("tools/call", {
    name: "proprietio_create_work_order",
    arguments: {
      property_id: "prop_001",
      unit_id: "unit_101",
      category: "plumbing",
      priority: "medium",
      description: "Tenant reports dripping bathroom faucet.",
    },
  });
  console.log(create.result?.content?.[0]?.text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
