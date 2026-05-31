# Proprietio MCP — Multi-Channel Distribution Strategy

Single source of truth for distributing the Proprietio MCP server to AI assistant
directories: **Claude (Anthropic), ChatGPT (OpenAI Apps SDK), Microsoft Copilot.**

Status: 2026-05-31 · grounded in the live `proprietio-mcp` source. Supersedes the
standalone ChatGPT/Copilot planning docs, which contained inaccurate repo paths
(see §2).

---

## 1. The one-paragraph thesis

ChatGPT Apps SDK and Microsoft Copilot both consume **the same thing Claude already
consumes: an MCP server over Streamable HTTP.** We have that, live at
`https://mcp.proprietio.com/mcp`, wired to the real backend (`BACKEND_MODE=live`).
So ~85% reuses across all three channels with **zero** server changes. There is exactly
**one shared engineering blocker — a real OAuth 2.1 server** — and building it unlocks
all three directories at once. Everything else is additive metadata (done — see §4) or
non-engineering submission collateral.

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
  `openWorldHint` + a human `title`. 14 reads, 4 writes; only `send_message` is
  open-world. ChatGPT's safety review and Copilot both key off these.
- **`structuredContent`** added to every `tools/call` result alongside the text block, so
  clients parse fields deterministically.
- Verified over the wire: `tools/list` returns annotations on all 18; `tools/call`
  returns `structuredContent`. Purely additive — frozen names/schemas untouched.

**Deferred to V2 (per channel):** ChatGPT `ui://` widget resources +
`_meta["openai/outputTemplate"]`; Copilot Adaptive Cards. Tool-only apps list fine.

### C. Missing for any public listing — the shared blocker + collateral
- **OAuth 2.1 server** (§5) — the only engineering blocker, shared by all three.
- Demo org/account that works without MFA/SMS/email (reviewer access).
- Privacy policy URL + data-handling disclosure (partly covered by the `ApiAccessLog`
  trail already shipped).
- Listing collateral: name, logo, short/long description, company URL, screenshots,
  validated test prompts.
- Copilot-only: Microsoft Partner Center, publisher domain verification (DNS TXT),
  multi-tenant Entra ID app, MACE attestation, and SOC 2 for enterprise.

---

## 5. The shared blocker: OAuth 2.1 (design)

Today: open demo mode. `bearerAuth` passes through when `DEMO_BEARER_TOKEN` is unset;
OAuth metadata is gated behind `MCP_OAUTH_ENABLED=false`; `auth.proprietio.com` endpoints
in `src/auth.ts` are placeholders. The live Claude connector relies on this open mode, so
**nothing flips on in prod until the AS is built and tested.**

### Target flow
1. ChatGPT/Copilot/Claude discovers auth via the two `.well-known` docs (already
   scaffolded in `src/auth.ts`).
2. **Dynamic Client Registration** (RFC 7591) — ChatGPT requires it; clients self-register.
3. **Authorization Code + PKCE (S256)** — user logs into Proprietio, consents to scopes.
4. Token issued, scoped to one `organizationId`. Refresh tokens for long-lived sessions.
5. MCP server validates the token → resolves `organizationId` → injects **that org's**
   rentaly `X-Api-Key` into `rentaly-client`. (Today a single env key serves one org;
   this is what makes it genuinely multi-tenant.)
6. Per-tool scopes already enumerated in `authorizationServerMetadata()` — wire enforcement
   (`properties:read`, `accounting:read`, `maintenance:write`, `communications:write`, …).

### Multi-tenancy = token, not URL
Tenant identity rides in the token. **No `/{workspace}/mcp` URL templating is needed.**
Copilot's Entra ID is just a *federation bridge* on top: Entra `tid` → Proprietio
`organizationId`, same resolution table.

### Decisions needed before writing the AS (the 2 that gate the build)
1. **Where does the authorization server run?**
   - (a) Inside the rentaly backend (Postgres already there for client/token/consent
     storage; reuses existing user login + sessions) — **recommended**, least new infra.
   - (b) A standalone `auth.proprietio.com` service.
   - (c) An external IdP (Auth0/WorkOS/Stytch) — fastest to DCR-compliant, monthly cost.
2. **Token/state store** (DCR clients, auth codes, refresh tokens, org mapping): if (a),
   new Prisma models in rentaly; if (c), the vendor holds it.

Once (1) is picked, the AS implementation is the next focused build. It is **HIGH effort**
but it is *one* build for *three* listings — the single highest-leverage item in the plan.

---

## 6. Roadmap (OAuth-first)

1. **DONE — Phase 0:** annotations + `structuredContent` (this PR). Channel-agnostic.
2. **NOW — OAuth 2.1 + DCR + per-org key mapping.** Pick the §5 hosting decision, build,
   keep behind `MCP_OAUTH_ENABLED` until tested, then flip. Unlocks all three.
3. **ChatGPT submission** — lightest incremental once OAuth lands: collateral + validated
   test prompts. Broad audience.
4. **Copilot Path A** (Copilot Studio MCP connector + Entra ID) in parallel with the
   Microsoft compliance dossier (Partner Center, MACE); SOC 2 as background work gating
   real enterprise deals.
5. **V2 UI** — ChatGPT widgets and/or Copilot Adaptive Cards, only where conversion
   justifies it. **Copilot Path B** (Teams app + Graph) only if Copilot converts.

---

## 7. Difficulty summary

| Module | Difficulty | Status |
|---|---|---|
| Reuse transport / tools / backend / health | none | done |
| Annotations + `structuredContent` | LOW | **done (this PR)** |
| OAuth 2.1 + DCR + per-org key mapping | **HIGH** | next — gated on §5 decision |
| ChatGPT collateral + test prompts | LOW–MED | after OAuth |
| Copilot: Entra ID + Partner Center + MACE | MED–HIGH | after OAuth, parallel |
| SOC 2 Type II (enterprise gate) | external | in progress, Q3 2026 |
| ChatGPT widgets / Copilot Adaptive Cards | MED–HIGH | V2, deferred |

**Net:** one MCP server, three directories, one shared blocker (OAuth). Phase 0 is shipped;
OAuth is the critical path and needs a single hosting decision to start.
