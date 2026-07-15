# Proprietio MCP — Multi-Channel Distribution Strategy

Single source of truth for distributing the Proprietio MCP server to AI assistant
directories: **Claude (Anthropic), ChatGPT (OpenAI Apps SDK), Microsoft Copilot.**

Status: 2026-05-31 (rev. B) · grounded in the live `proprietio-mcp` source. Supersedes
the standalone ChatGPT/Copilot planning docs, which contained inaccurate repo paths
(see §2).

> **Rev. B — the shared blocker is gone.** OAuth 2.1 shipped to production on 2026-05-31.
> rentaly (`api.proprietio.com`) is the live Authorization Server (Auth Code + PKCE S256,
> DCR per RFC 7591, refresh rotation, discovery RFC 8414/9728). The connector forwards the
> per-user bearer; rentaly resolves `token → organizationId` and enforces the 6 scopes. The
> Claude.ai connector is verified end-to-end in OAuth mode. **§5 is now a record of what was
> built, not a design.** The remaining work for ChatGPT and Copilot is **collateral and
> compliance only — no engineering blocker remains.** Per-channel submission packets:
> [`chatgpt-apps-sdk-submission.md`](./chatgpt-apps-sdk-submission.md) ·
> [`copilot-submission.md`](./copilot-submission.md).

---

## 1. The one-paragraph thesis

ChatGPT Apps SDK and Microsoft Copilot both consume **the same thing Claude already
consumes: an MCP server over Streamable HTTP.** We have that, live at
`https://mcp.proprietio.com/mcp`, wired to the real backend (`BACKEND_MODE=live`).
So ~85% reuses across all three channels with **zero** server changes. The one shared
engineering blocker — a real OAuth 2.1 server — **shipped to prod on 2026-05-31** and
unlocked all three directories at once. Everything left is additive metadata (done — see §4)
or non-engineering submission collateral (the per-channel packets in §6).

**Three rules that hold for every channel:**
1. **One tool set, never renamed.** The 18 `proprietio_*` names are the frozen public
   contract (root `CLAUDE.md` §8). ChatGPT and Copilot are naming-agnostic. Curate
   *which* tools show per channel if needed — never rename or fork.
2. **No `draft_*` tools.** Drafting an email/notice is a native model capability. A draft
   tool is redundant. We already expose the real actions.
3. **V1 is tool-only.** Rich UI (ChatGPT widgets, Copilot Adaptive Cards) is a V2 — not
   required to list.

---

## 2. Repo reality check (correcting the inbound docs)

Both inbound planning docs (`07_chatgpt…`, `08_…copilot…`) were drafted generically and
cite files that **do not exist**. Anyone implementing must use the real paths:

| Inbound doc claims | Actual |
|---|---|
| `src/rentaly-client.ts` | `src/api/rentaly-client.ts` |
| `src/mocks/` | `src/data/mock.ts` |
| `src/middleware/audit.ts` | **Does not exist in the MCP repo.** Audit (`ApiAccessLog`) lives in the **rentaly backend** (`server/lib/apiAccessLog.js`), populated on every `/api/v1/*` call. |
| `src/middleware/rate-limit.ts` | **Does not exist in the MCP repo.** Rate limiting is in the rentaly backend `/api/v1` router. |
| `src/types.ts` "input + output schemas" | Input schemas only. No output schemas. |
| tools `search_properties`, `draft_email_to_tenant`, … | Real names are `proprietio_*`; no `draft_*` tools exist. |

**Actual structure:**
```
src/
├── index.ts                 # entry: stdio | HTTP (StreamableHTTPServerTransport, stateless)
├── server.ts                # MCP Server factory: ListTools + CallTool handlers
├── auth.ts                  # OAuth metadata + bearerAuth (gated; open by default)
├── api/rentaly-client.ts    # single conversion point → api.proprietio.com (X-Api-Key)
├── data/mock.ts             # mock fixtures (BACKEND_MODE=mock fallback)
├── types.ts                 # 18 Zod INPUT schemas
└── tools/
    ├── index.ts             # ToolDefinition + registry (self-checks === 18)
    ├── properties.ts (5) · accounting.ts (6) · maintenance.ts (6) · comms.ts (1)
```
Audit + rate limiting are **backend** concerns (rentaly), already shipped 2026-05-29
(immutable `ApiAccessLog` + graceful 429 headers). The MCP server itself stays thin.

---

## 3. Channel comparison

| | Claude / Anthropic | ChatGPT / Apps SDK | Microsoft Copilot |
|---|---|---|---|
| Protocol | MCP Streamable HTTP | same | same (Copilot Studio MCP connector) |
| Server reuse | live today | ~85% as-is | ~85% as-is |
| Auth required for public listing | OAuth 2.1 | OAuth 2.1 + Dynamic Client Registration | OAuth + **Entra ID** federation |
| Tool metadata | annotations (done §4) | annotations + `structuredContent` (done §4) | same |
| UI layer | n/a | widgets (`ui://`) — V2 | Adaptive Cards — V2 |
| Compliance gate | Partner review | OpenAI review | MACE ≥80 + likely **SOC 2 Type II** |
| Audience | tech-savvy ops, modern REITs | broad prosumer | enterprise IT, F500, M365 shops |
| Realistic effort after OAuth | ~done | low (collateral) | medium–high (compliance) |

**Key correction to the inbound Copilot doc:** Copilot is the highest *long-term value*
channel but **not** the fastest — its public listing is gated by Microsoft compliance
(MACE, Partner Center, and SOC 2 Type II for serious enterprise deals). Our SOC 2 is in
progress, target Q3 2026. So Copilot's "2-week sprint" is the *technical wiring* only.

---

## 4. Per-channel gap analysis (A reuse / B change / C missing)

### A. Reuses as-is across ALL channels (no change)
Transport (stateless Streamable HTTP), the 18 tools + Zod input schemas, the
`rentaly-client` live backend, `/` and `/healthz` (CI-monitored), the MCP error contract.

### B. Apps-SDK / Copilot compatibility — DONE (this PR, additive, contract-safe)
- **Tool annotations** on all 18: `readOnlyHint` / `destructiveHint` / `idempotentHint` /
  `openWorldHint` + a human `title`. 14 reads, 4 writes; `update_work_order`,
  `close_work_order`, and `send_message` are conservatively marked destructive; only
  `send_message` is open-world. ChatGPT's safety review and Copilot both key off these.
- **`structuredContent`** added to every `tools/call` result alongside the text block, so
  clients parse fields deterministically.
- Verified over the wire: `tools/list` returns annotations on all 18; `tools/call`
  returns `structuredContent`. Purely additive — frozen names/schemas untouched.

**Deferred to V2 (per channel):** ChatGPT `ui://` widget resources +
`_meta["openai/outputTemplate"]`; Copilot Adaptive Cards. Tool-only apps list fine.

### C. Missing for any public listing — collateral (the blocker is cleared)
- ~~**OAuth 2.1 server** (§5)~~ — **SHIPPED 2026-05-31.** No longer blocking.
- Demo org/account that works without MFA/SMS/email (reviewer access).
- Privacy policy URL + data-handling disclosure (partly covered by the `ApiAccessLog`
  trail already shipped).
- Listing collateral: name, logo, short/long description, company URL, screenshots,
  validated test prompts.
- Copilot-only: Microsoft Partner Center, publisher domain verification (DNS TXT),
  multi-tenant Entra ID app, MACE attestation, and SOC 2 for enterprise.

---

## 5. The shared blocker: OAuth 2.1 — SHIPPED 2026-05-31

**Decision taken:** option (a) — rentaly **IS** the Authorization Server. No external IdP,
no standalone `auth.proprietio.com` service. Least new infra; reuses the existing Postgres,
user login, and sessions. State lives in three Prisma models (`OAuthClient` /
`OAuthAuthCode` / `OAuthToken`). This is one build that lit up all three directories.

### What's live (issuer = `https://api.proprietio.com`)
1. **Discovery** — `GET /.well-known/oauth-authorization-server` (RFC 8414) on the issuer
   and `GET /.well-known/oauth-protected-resource` (RFC 9728) on the resource. Both **200**
   in prod. The connector advertises the resource doc and 401s with `WWW-Authenticate` when
   a bearer is absent, so any MCP client auto-starts the flow.
2. **Dynamic Client Registration** (RFC 7591) at `/oauth/register` — ChatGPT and Claude
   both self-register; no manual client provisioning.
3. **Authorization Code + PKCE (S256 only)** — `/oauth/authorize` renders a stateless
   consent screen (signed ticket JWT, no server session) → `/oauth/token` issues the token.
4. **Refresh rotation** on `/oauth/token`; **revocation** (RFC 7009) on `/oauth/revoke`.
5. **Token → `organizationId`** resolution at rentaly: the connector forwards the bearer
   verbatim (via an `AsyncLocalStorage` request context, never stored), and `/api/v1/*`
   resolves the org and **enforces the 6 scopes** per route — the real boundary. The
   connector's `src/scopes.ts` mirrors the map advisory-only, to name a missing scope in
   the error Claude shows.

### The 6 scopes (frozen vocabulary, lockstep with rentaly `oauthConfig.js`)
`properties:read` · `tenants:read` · `accounting:read` · `maintenance:read` ·
`maintenance:write` · `communications:write` → 14 read tools, 4 write tools.

### Multi-tenancy = token, not URL
Tenant identity rides in the token. **No `/{workspace}/mcp` URL templating.** Copilot's
Entra ID is just a *federation bridge* layered on top: Entra `tid` → Proprietio
`organizationId`, same resolution table — see `copilot-submission.md` §3.

### Operational toggles (both Render services)
`MCP_OAUTH_ENABLED=true` flips OAuth on; setting it to `false`/unset rolls back to
`X-Api-Key`/demo mode, fully backward-compatible. rentaly reads `MCP_OAUTH_ISSUER` /
`MCP_OAUTH_RESOURCE_URL` / `JWT_SECRET`; the connector reads `OAUTH_ISSUER` /
`MCP_RESOURCE_URL` / `RENTALY_API_BASE_URL` (keep the `/api` suffix).

---

## 6. Roadmap (OAuth-first) — blocker cleared

1. **DONE — Phase 0:** annotations + `structuredContent`. Channel-agnostic.
2. **DONE — OAuth 2.1 + DCR + per-org token resolution.** rentaly = AS (option a). Shipped
   and flipped on in prod 2026-05-31; Claude.ai verified end-to-end. Unlocked all three.
3. **NOW — ChatGPT submission** — collateral + validated test prompts. Packet ready:
   [`chatgpt-apps-sdk-submission.md`](./chatgpt-apps-sdk-submission.md). The lightest
   channel now that OAuth is live (Apps SDK consumes our MCP + DCR + PKCE as-is).
4. **NOW — Copilot Path A** (Copilot Studio MCP connector + Entra ID federation) in parallel
   with the Microsoft compliance dossier (Partner Center, MACE); SOC 2 as background work
   gating real enterprise deals. Packet ready:
   [`copilot-submission.md`](./copilot-submission.md).
5. **V2 UI** — ChatGPT widgets and/or Copilot Adaptive Cards, only where conversion
   justifies it. **Copilot Path B** (Teams app + Graph) only if Copilot converts.

---

## 7. Difficulty summary

| Module | Difficulty | Status |
|---|---|---|
| Reuse transport / tools / backend / health | none | done |
| Annotations + `structuredContent` | LOW | **done** |
| OAuth 2.1 + DCR + per-org token resolution | **HIGH** | **done — shipped 2026-05-31** |
| ChatGPT collateral + test prompts | LOW–MED | **packet ready** → submit |
| Copilot: Entra ID + Partner Center + MACE | MED–HIGH | **packet ready** → in flight |
| SOC 2 Type II (enterprise gate) | external | in progress, Q3 2026 |
| ChatGPT widgets / Copilot Adaptive Cards | MED–HIGH | V2, deferred |

**Net:** one MCP server, three directories, one shared blocker (OAuth) — **now cleared.**
Both Phase 0 and the OAuth critical path are shipped. What remains is non-engineering:
submit the ChatGPT packet, drive the Copilot compliance dossier, finish SOC 2.
