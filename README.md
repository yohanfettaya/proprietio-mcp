# Proprietio MCP

> Modern property management, accounting, and maintenance connector for Claude.

Proprietio MCP exposes Proprietio's property management platform as a Model Context Protocol (MCP) server. Claude users — property managers, multifamily operators, and asset managers — can query and act on portfolio data in natural language.

This repository contains the **reference implementation** with embedded mock data, ready for local demo and review.

---

## Quick start

### Prerequisites

- Node.js 20+
- npm 10+

### Install & run (local HTTP server)

```bash
npm install
cp .env.example .env
npm run dev
```

Server listens on `http://localhost:3030`. Health check:

```bash
curl http://localhost:3030/
```

### Run the demo client

In a second terminal, while the server is running:

```bash
npm run demo
```

This walks through 7 representative tool calls (search properties, delinquency aging, NOI, work order creation, etc.) against the embedded mock portfolio.

---

## Architecture

```
src/
├── index.ts            HTTP / stdio entrypoint
├── server.ts           MCP Server factory (registers ListTools + CallTool)
├── auth.ts             OAuth 2.0 metadata + bearer middleware
├── types.ts            Zod input schemas + entity types
├── tools/
│   ├── index.ts        Tool registry (19 public tools + 1 debug)
│   ├── operations.ts   Daily operations brief (1)
│   ├── properties.ts   Leasing & properties (5)
│   ├── accounting.ts   GL, rent roll, P&L, NOI (6)
│   ├── maintenance.ts  Work orders & vendors (6)
│   └── comms.ts        Tenant/vendor messaging (1)
└── data/
    └── mock.ts         Demo Texas portfolio (3 properties, ~10 units)
```

---

## Tools (19 public)

| Domain | Tool | Scope |
|--------|------|-------|
| Operations | `proprietio_get_daily_brief` | `properties:read` + `accounting:read` + `maintenance:read` |
| Properties | `proprietio_search_properties` | `properties:read` |
| Properties | `proprietio_get_property` | `properties:read` |
| Properties | `proprietio_list_units` | `properties:read` |
| Properties | `proprietio_get_lease` | `properties:read` |
| Properties | `proprietio_list_residents` | `tenants:read` |
| Accounting | `proprietio_get_rent_roll` | `accounting:read` |
| Accounting | `proprietio_get_delinquency` | `accounting:read` |
| Accounting | `proprietio_get_income_statement` | `accounting:read` |
| Accounting | `proprietio_get_balance_sheet` | `accounting:read` |
| Accounting | `proprietio_get_general_ledger` | `accounting:read` |
| Accounting | `proprietio_get_noi` | `accounting:read` |
| Maintenance | `proprietio_search_work_orders` | `maintenance:read` |
| Maintenance | `proprietio_get_work_order` | `maintenance:read` |
| Maintenance | `proprietio_create_work_order` | `maintenance:write` |
| Maintenance | `proprietio_update_work_order` | `maintenance:write` |
| Maintenance | `proprietio_close_work_order` | `maintenance:write` |
| Maintenance | `proprietio_list_vendors` | `maintenance:read` |
| Comms | `proprietio_send_message` | `communications:write` |

Each tool's full JSON Schema is returned by the MCP `tools/list` call at runtime.

---

## Use with Claude Desktop (stdio)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "proprietio": {
      "command": "node",
      "args": ["/absolute/path/to/proprietio-mcp/dist/index.js", "stdio"]
    }
  }
}
```

Then build once and restart Claude Desktop:

```bash
npm run build
```

---

## Use with Claude.ai / Claude Code (remote HTTP)

The HTTP server exposes:

- `POST /mcp` — MCP JSON-RPC endpoint (Streamable HTTP transport)
- `GET /.well-known/oauth-authorization-server` — OAuth 2.0 metadata (RFC 8414)
- `GET /.well-known/oauth-protected-resource` — Resource metadata (RFC 9728)

Add the remote MCP at `https://your-host/mcp` in Claude Settings → Connectors. Claude follows the well-known metadata to negotiate OAuth.

---

## Demo prompts (for Anthropic review)

Once Claude is connected, try:

1. *"Give me today's Proprietio operations brief for my portfolio."*
2. *"What's the delinquency rate across my Texas portfolio this month, grouped by property?"*
3. *"Show me all open maintenance work orders older than 7 days and draft a vendor follow-up message."*
4. *"What's the NOI for The Madison in May 2026?"*
5. *"Create a high-priority work order for unit 102 at The Madison — kitchen sink is leaking."*
6. *"Compare rent roll between Riverbend Lofts and Hill Country Commons."*

---

## Authentication

### Production mode — OAuth 2.1 (live since 2026-05-31)

Set `MCP_OAUTH_ENABLED=true` and the connector runs in real OAuth mode. The Authorization
Server is **rentaly** at `OAUTH_ISSUER=https://api.proprietio.com` (not an external IdP):
Authorization Code + PKCE (S256 only), Dynamic Client Registration (RFC 7591), rotating
refresh tokens, discovery per RFC 8414/9728. The connector requires a bearer on `/mcp`
(absent → 401 + `WWW-Authenticate`, so the client starts the flow), then forwards it
verbatim to rentaly via a per-request `AsyncLocalStorage` context (never stored). rentaly
resolves `token → organizationId` and enforces scopes per route — the real boundary.

Scopes: `properties:read`, `tenants:read`, `accounting:read`, `maintenance:read`,
`maintenance:write`, `communications:write` (15 public read tools, 4 write). `src/scopes.ts`
mirrors the tool→scope map advisory-only, to name a missing scope in the error.

### Demo / open mode (local dev)

With `MCP_OAUTH_ENABLED` unset: set `DEMO_BEARER_TOKEN` to require a single static
`Authorization: Bearer <token>`, or leave both unset for a fully open local demo. Rolling
`MCP_OAUTH_ENABLED` back to unset/`false` is a backward-compatible production rollback.

Multi-channel distribution (Claude / ChatGPT Apps SDK / Microsoft Copilot) and the
per-channel submission packets live in [`docs/distribution-strategy.md`](docs/distribution-strategy.md).

---

## Deployment

### Cloudflare Workers

The HTTP transport is compatible with Workers' `fetch` runtime. For a Workers deploy, replace the Express boilerplate in `src/index.ts` with a `fetch(req)` handler that calls `transport.handleRequest(req, res, body)`. See `docs/cloudflare.md` (todo).

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
ENV PORT=3030
EXPOSE 3030
CMD ["node", "dist/index.js"]
```

### Fly.io / Render

Standard Node app — `npm run build && npm start`. Bind to `0.0.0.0:$PORT`.

---

## Switching from mock to live data

Set `BACKEND_MODE=live` and `PROPRIETIO_API_URL` + `PROPRIETIO_API_KEY` in `.env`. Then wire the handlers in `src/tools/*.ts` to call your real Proprietio REST endpoints instead of the mock arrays. The Zod input/output contracts stay the same.

---

## Security

- TLS termination at the edge (Cloudflare / your load balancer)
- OAuth 2.0 Authorization Code + PKCE (S256)
- Bearer token in `Authorization` header on every tool call
- Granular scopes per tool (read vs write)
- Tenant isolation enforced at the database row level in Proprietio (org_id on every row)
- Every tool call logged with org_id, user_id, tool name, latency, status
- Bug bounty: HackerOne private program
- SOC 2 Type II attestation: in progress (target Q3 2026)

Report security issues to `security@proprietio.com`.

---

## License

MIT © Proprietio

---

## Contact

- **Yohan Fettaya** — Founder & CEO — yohan@proprietio.com
- **Support** — support@proprietio.com
- **Help center** — https://www.proprietio.com/help
- **Privacy policy** — https://www.proprietio.com/privacy
- **Status page** — https://status.proprietio.com
