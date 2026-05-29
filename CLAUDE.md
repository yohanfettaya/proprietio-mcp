# Proprietio x Claude MCP Integration — Status Brief

Last updated: 2026-05-29

This file is the handoff context for the Proprietio MCP server. Read it first before touching anything MCP-related.

---

## 1. Status today (2026-05-29)

- Application submitted to the **Anthropic Partner Network / Connector Directory**. Awaiting review.
- MCP server is **live** at `https://mcp.proprietio.com/mcp`.
- Source repo: `https://github.com/yohanfettaya/proprietio-mcp`.
- **18 tools** exposed, grouped: properties (5), accounting (6), maintenance (6), comms (1).
- Hosted on **Render free tier** — instance spins down after ~15 min of inactivity, first call after sleep takes ~30s. Fine for demo, not for prod.
- **Mock data only.** Every tool handler returns hardcoded fixtures. Backend wiring to the real Proprietio API is not done yet.

---

## 2. Architecture summary

- TypeScript + Express + `@modelcontextprotocol/sdk`.
- Transport: **Streamable HTTP** on `POST /mcp`.
- OAuth 2.0 metadata endpoints (`.well-known/oauth-authorization-server`, etc.) are gated behind `MCP_OAUTH_ENABLED`. Currently **disabled** — server runs in open demo mode.
- Optional bearer auth via `DEMO_BEARER_TOKEN`. Currently **disabled**.
- Entry point: `src/server.ts`. Tool handlers live under `src/tools/*.ts`.

Relevant env vars:

| Var | Current | Purpose |
|---|---|---|
| `MCP_OAUTH_ENABLED` | `false` | Toggle OAuth metadata + token validation |
| `DEMO_BEARER_TOKEN` | unset | Optional static bearer for gated demos |
| `BACKEND_MODE` | `mock` | Switch to `live` once real API wiring lands |
| `PORT` | `3000` | Render assigns this |

---

## 3. How to test

**Local:**
```bash
git clone https://github.com/yohanfettaya/proprietio-mcp
cd proprietio-mcp
npm install
npm run dev      # starts server on :3000
npm run demo     # in another terminal — exercises all 18 tools
```

**Production (Claude.ai):**
1. claude.ai -> Settings -> Connectors -> Add custom connector.
2. URL: `https://mcp.proprietio.com/mcp`.
3. Save. Tools appear under the Proprietio connector.

Confirmed end-to-end working in Claude.ai today (2026-05-29).

---

## 4. TODO before this is production-ready for Anthropic

In rough priority order:

1. **Real backend wiring.** Replace mock handlers in `src/tools/*.ts` with calls to the Proprietio REST API. Flip `BACKEND_MODE=live`.
2. **Real OAuth 2.0 server** at `auth.proprietio.com` — Authorization Code + PKCE, per-tool scopes, refresh tokens. Then flip `MCP_OAUTH_ENABLED=true`.
3. **Move off Render free tier** — paid Render tier or migrate to AWS (ECS Fargate behind ALB). Kill spin-down behavior.
4. **SOC 2 Type II** attestation. In progress, target Q3 2026.
5. **Pen test** with NCC Group, Q3 2026.
6. **Public docs** at `developers.proprietio.com/mcp` — tool reference, auth flow, examples.
7. **Observability dashboard** — per-tool p50/p95 latency, error rate, auth failures. Datadog or Grafana Cloud.
8. **Per-tenant rate limits** — once auth is real, enforce per-org quotas.

---

## 5. The 18 tools

**Properties (5)**
- `proprietio_search_properties` — search portfolio by address, owner, status.
- `proprietio_get_property` — fetch one property by ID with units and metadata.
- `proprietio_list_units` — list units for a property.
- `proprietio_get_rent_roll` — current rent roll snapshot for a property.
- `proprietio_list_residents` — residents/tenants for a property or unit.

**Accounting (6)**
- `proprietio_get_balance_sheet` — balance sheet for an entity at a date.
- `proprietio_get_income_statement` — P&L for a period.
- `proprietio_get_general_ledger` — GL entries with filters.
- `proprietio_get_noi` — net operating income for a property/period.
- `proprietio_get_delinquency` — current AR aging / delinquent residents.
- `proprietio_get_lease` — lease terms, charges, dates by lease ID.

**Maintenance (6)**
- `proprietio_create_work_order` — open a new work order.
- `proprietio_get_work_order` — fetch a work order by ID.
- `proprietio_search_work_orders` — filter by status, property, vendor, date.
- `proprietio_update_work_order` — edit status, notes, assignment.
- `proprietio_close_work_order` — mark complete with resolution.
- `proprietio_list_vendors` — vendors available for assignment.

**Comms (1)**
- `proprietio_send_message` — send a message to a resident or vendor.

---

## 6. Deliverables produced today

All in the Proprietio working folder:

- Pitch deck (`.pptx`)
- One-pager PDF
- MCP technical spec PDF
- MCP server source code -> `https://github.com/yohanfettaya/proprietio-mcp`

Live URLs:
- Server: `https://mcp.proprietio.com/mcp`
- Repo: `https://github.com/yohanfettaya/proprietio-mcp`

---

## 7. Who to ask

- **Yohan Fettaya** — founder, product decisions. `yohan@proprietio.com`.
- **Backend integration** (when it starts): a backend engineer needs to walk each handler in `src/tools/*.ts` and map it to the corresponding Proprietio REST API endpoint. Input schemas stay; only the handler body changes.

---

## 8. DO NOT modify

The **18 tool names and their input schemas are the public MCP contract** submitted to Anthropic. Every Claude integration that lands binds against these names and shapes.

- Do **not** rename a tool.
- Do **not** remove or rename a field on an input schema.
- Additive changes (new optional fields, new tools) are fine.
- Breaking changes require a versioned migration plan and coordination with Anthropic — assume that takes weeks.

If a tool needs to die, deprecate it: keep it registered, make the handler return a deprecation notice, and ship the replacement alongside it for at least one full release cycle.
