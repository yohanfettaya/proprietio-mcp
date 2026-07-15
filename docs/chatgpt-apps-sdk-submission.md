# ChatGPT Apps SDK — Submission Packet

Everything OpenAI's review needs to list Proprietio in the ChatGPT app directory. The
ChatGPT Apps SDK consumes an MCP server over Streamable HTTP — **the same server Claude
already runs in prod** — so there is no new build. This packet is collateral + a reviewer
runbook only.

Status: 2026-05-31 · ready to submit · OAuth 2.1 live in prod (the former blocker).
Owner: Yohan Fettaya (yohan@proprietio.com).

---

## 0. Why we can submit now

The Apps SDK requires, for a public listing: an MCP server, OAuth 2.1 with **Dynamic Client
Registration** (clients self-register — no manual client_id hand-off), **PKCE (S256)**, and
machine-readable tool metadata. All four are live:

| Requirement | Status | Evidence |
|---|---|---|
| MCP server over Streamable HTTP | live | `POST https://mcp.proprietio.com/mcp` |
| OAuth 2.1 Authorization Code + PKCE S256 | live | `https://api.proprietio.com/.well-known/oauth-authorization-server` → 200 |
| Dynamic Client Registration (RFC 7591) | live | `POST https://api.proprietio.com/oauth/register` |
| Protected-resource discovery (RFC 9728) | live | connector 401 → `WWW-Authenticate` → resource doc |
| Tool annotations (`readOnlyHint` etc.) | live | `tools/list` returns annotations on all 18 |
| `structuredContent` on results | live | `tools/call` returns it alongside the text block |

ChatGPT's safety review keys off the annotations: 14 tools are `readOnlyHint: true`; the 3
maintenance writes plus `send_message` are not. `update_work_order`, `close_work_order`, and
`send_message` are conservatively marked destructive; only `proprietio_send_message` is
`openWorldHint: true` (it leaves the system — sends to a resident/vendor).

---

## 1. Listing metadata (copy-paste fields)

| Field | Value |
|---|---|
| App name | **Proprietio** |
| Tagline (≤10 words) | Property management, accounting & maintenance for your portfolio. |
| Category | Productivity / Real Estate |
| Short description (≤140 chars) | Query rent rolls, NOI, delinquency, and work orders — and act on them — across your real-estate portfolio in natural language. |
| Long description | See §1.1 |
| Developer / company | Proprietio |
| Company URL | https://www.proprietio.com |
| Developer docs | https://developers.proprietio.com/mcp |
| Support email | support@proprietio.com |
| Security contact | security@proprietio.com |
| Privacy policy URL | https://www.proprietio.com/legal/privacy |
| Terms of service URL | https://www.proprietio.com/legal/terms |
| Status page | https://status.proprietio.com |
| MCP endpoint | https://mcp.proprietio.com/mcp |
| OAuth issuer | https://api.proprietio.com |
| Logo | `assets/logo-512.png` (512×512, transparent PNG) — **to attach** |

### 1.1 Long description

> Proprietio connects ChatGPT to your live property-management platform. Ask about any
> property, unit, lease, or resident; pull accounting in plain English — rent roll,
> delinquency aging, income statement, balance sheet, general ledger, net operating
> income; and run maintenance end to end — search, open, update, and close work orders,
> and look up vendors. You can also message residents and vendors directly.
>
> Every request is scoped to your organization through OAuth 2.1: you log in to Proprietio,
> consent to a specific set of permissions (read vs. write, per domain), and ChatGPT only
> ever sees the data those scopes allow. Reads and writes are isolated per tenant at the
> database row level, and every tool call is logged with your org, user, the tool, latency,
> and status.

---

## 2. OAuth configuration for the OpenAI app form

The Apps SDK auto-discovers everything from the issuer's well-known doc; these are the
values to confirm in the form:

```
Authorization server (issuer):  https://api.proprietio.com
Authorization endpoint:         https://api.proprietio.com/oauth/authorize
Token endpoint:                 https://api.proprietio.com/oauth/token
Revocation endpoint:            https://api.proprietio.com/oauth/revoke
Dynamic Client Registration:    https://api.proprietio.com/oauth/register   (RFC 7591)
PKCE:                           required, S256 only
Token endpoint auth methods:    client_secret_post, none
Grant types:                    authorization_code, refresh_token  (rotating)
```

### Scopes to request in the listing (least-privilege default)

Request **read scopes by default**; the 2 write scopes are opt-in at consent so a reviewer
(or a cautious user) can list/test without granting write:

| Scope | Grants | Default in listing |
|---|---|---|
| `properties:read` | properties, units, leases | ✅ |
| `tenants:read` | residents / contact + balance | ✅ |
| `accounting:read` | rent roll, delinquency, P&L, balance sheet, GL, NOI | ✅ |
| `maintenance:read` | search/get work orders, list vendors | ✅ |
| `maintenance:write` | create / update / close work orders | opt-in |
| `communications:write` | send message to resident/vendor | opt-in |

If ChatGPT requests only the four read scopes, the 3 maintenance write tools plus
`send_message` return a
403 `insufficient_scope`, and the connector enriches the error with the exact scope to grant
("re-authorize the connector to grant maintenance:write"). This is the intended, reviewable
behavior — not a bug.

---

## 3. Tool catalog (18 — frozen public contract)

Names and input schemas are the frozen Anthropic-side contract (root `CLAUDE.md` §8);
ChatGPT is naming-agnostic and reuses them verbatim. **14 read, 4 write.**

| Domain | Tool (`name`) | Title | R/W | Scope |
|---|---|---|---|---|
| Properties | `proprietio_search_properties` | Search properties | R | `properties:read` |
| Properties | `proprietio_get_property` | Get property | R | `properties:read` |
| Properties | `proprietio_list_units` | List units | R | `properties:read` |
| Properties | `proprietio_get_lease` | Get lease | R | `properties:read` |
| Properties | `proprietio_list_residents` | List residents | R | `tenants:read` |
| Accounting | `proprietio_get_rent_roll` | Get rent roll | R | `accounting:read` |
| Accounting | `proprietio_get_delinquency` | Get delinquency | R | `accounting:read` |
| Accounting | `proprietio_get_income_statement` | Get income statement | R | `accounting:read` |
| Accounting | `proprietio_get_balance_sheet` | Get balance sheet | R | `accounting:read` |
| Accounting | `proprietio_get_general_ledger` | Get general ledger | R | `accounting:read` |
| Accounting | `proprietio_get_noi` | Get NOI | R | `accounting:read` |
| Maintenance | `proprietio_search_work_orders` | Search work orders | R | `maintenance:read` |
| Maintenance | `proprietio_get_work_order` | Get work order | R | `maintenance:read` |
| Maintenance | `proprietio_list_vendors` | List vendors | R | `maintenance:read` |
| Maintenance | `proprietio_create_work_order` | Create work order | **W** | `maintenance:write` |
| Maintenance | `proprietio_update_work_order` | Update work order | **W** | `maintenance:write` |
| Maintenance | `proprietio_close_work_order` | Close work order | **W** | `maintenance:write` |
| Comms | `proprietio_send_message` | Send message | **W** (open-world) | `communications:write` |

---

## 4. Reviewer runbook (give this to OpenAI)

**A dedicated demo org with no MFA/SMS gate must exist before submitting** (see §6 checklist).

1. In ChatGPT → Settings → Apps/Connectors → add the Proprietio app.
2. OAuth prompt → log in with the reviewer demo credentials (provided privately, not in
   this file). Consent screen shows the requested scopes; click Approve.
3. Run these prompts (read-only, deterministic against the seeded demo portfolio). Use
   the exact prompts and expected outcomes below in the OpenAI submission form:

   | Prompt | Expected tool call | Expected outcome |
   |---|---|---|
   | *"Search my Proprietio properties in Texas."* | `proprietio_search_properties` with `state:"TX"` | 3 properties: The Madison (`prop_001`), Riverbend Lofts (`prop_002`), Hill Country Commons (`prop_003`). |
   | *"Show delinquency aging for portfolio port_tx as of 2026-05-31, grouped by property."* | `proprietio_get_delinquency` with `scope_id:"port_tx"`, `as_of_date:"2026-05-31"`, `group_by:"property"` | Total delinquency is `$12,800`: The Madison `$7,250`, Riverbend Lofts `$3,850`, Hill Country Commons `$1,700`. |
   | *"What was the NOI for The Madison, property prop_001, from 2026-05-01 to 2026-05-31?"* | `proprietio_get_noi` with `scope_id:"prop_001"`, `period_start:"2026-05-01"`, `period_end:"2026-05-31"` | One-month result: total revenue `$6,864`, operating expenses `$2,883`, NOI `$3,981`, NOI margin `58%`. |
   | *"Show open work orders older than 7 days."* | `proprietio_search_work_orders` with `status:"open"`, `min_days_open:7` | 2 work orders: `wo_002` (The Madison/unit 104 turnover prep, 14 days) and `wo_004` (Riverbend Lofts lobby fixtures, 47 days). |
   | *"List residents at The Madison, property prop_001, with their balance due."* | `proprietio_list_residents` with `property_id:"prop_001"` | 4 residents: Sarah Chen `$0`, Marcus Johnson `$2,350`, Elena Johnson `$0`, David Park `$4,900`. The answer should summarize names and balances only unless contact information is explicitly requested. |

4. Write-path (only if write scopes were granted):
   - *"Open a high-priority work order for [demo unit] — kitchen sink leaking."* → `proprietio_create_work_order`
   - *"Mark work order [id] complete; resolution: replaced trap."* → `proprietio_close_work_order`

5. Scope-denial demo (expected behavior to show the reviewer): connect with read scopes
   only, then ask to create a work order → tool returns a 403 naming `maintenance:write`.

**Expected:** structured results parsed into ChatGPT's UI from `structuredContent`; no PII
beyond the seeded demo org; first call after idle may take ~30s (free-tier spin-down — see
§5 risk).

---

## 5. Known risks / reviewer-facing notes

- **Cold start.** The MCP host is on Render free tier; after ~15 min idle the first call
  takes ~30s. Mitigation before/at submission: move to paid Render or a warm-ping. Flag in
  the submission notes so a slow first call isn't read as a failure. (Tracked in root
  `CLAUDE.md` §4.3.)
- **Write tools are real.** `create/update/close_work_order` and `send_message` mutate the
  demo org and (for `send_message`) can leave the system. Keep them on the seeded demo org;
  do not grant write scopes against a real customer org during review.
- **No widgets in V1.** Tool-only app. ChatGPT renders `structuredContent`; no `ui://`
  resource templates yet (V2, per distribution-strategy §6.5).

---

## 6. Pre-submission checklist (owner: Yohan)

- [ ] Demo org seeded (properties, units, leases, residents, a few work orders, vendors).
- [ ] Demo login works with **no** MFA/SMS/email step (reviewer can't pass 2FA).
- [ ] Privacy policy + ToS URLs live and reachable (§1 links resolve, not 404).
- [ ] 512×512 transparent logo committed to `assets/` and attached in the form.
- [ ] 3–5 screenshots: connect/consent screen + 2–3 tool results in ChatGPT.
- [ ] Cold-start mitigated (paid tier or warm-ping) OR noted in submission.
- [ ] Confirm `MCP_OAUTH_ENABLED=true` on both Render services (it is, as of 2026-05-31).
- [ ] With an authenticated reviewer/demo token, call `tools/list` on the live MCP endpoint
      and confirm the emitted annotations match `test/annotations.contract.test.ts`:
      all read tools and `proprietio_create_work_order` have `destructiveHint:false`;
      `proprietio_update_work_order`, `proprietio_close_work_order`, and
      `proprietio_send_message` have `destructiveHint:true`; only
      `proprietio_send_message` has `openWorldHint:true`.
- [ ] Run `npm test`; this includes `test/reviewer-prompts.contract.test.ts`, which
      asserts the exact expected outcomes listed in §4.
- [ ] Run §4 prompts once in ChatGPT yourself before submitting.
- [ ] Reviewer credentials shared with OpenAI through their secure channel — **never** in
      this repo or any committed file.
