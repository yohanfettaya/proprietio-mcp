# Microsoft Copilot — Submission Packet (Path A)

How Proprietio reaches Microsoft 365 Copilot. **Path A = Copilot Studio MCP connector +
Entra ID federation** — the fastest technical route that reuses our live MCP server. Path B
(a full Teams app + Microsoft Graph) is deferred until Copilot converts.

Copilot is the highest *long-term* value channel (enterprise, F500, M365 shops) but **not**
the fastest: the technical wiring is a short sprint, but the **public/marketplace listing is
gated by Microsoft compliance** (Partner Center, MACE attestation, and SOC 2 Type II for
serious enterprise deals). This packet separates the two so the wiring can land now and the
compliance dossier runs in parallel.

Status: 2026-05-31 · OAuth 2.1 live (former blocker cleared) · SOC 2 Type II in progress
(target Q3 2026). Owner: Yohan Fettaya (yohan@proprietio.com).

---

## 0. The two tracks (don't conflate them)

| Track | What it unlocks | Gating | Effort |
|---|---|---|---|
| **A1 — Technical wiring** | Proprietio usable in Copilot for *your own / pilot tenants* | Entra ID app + Copilot Studio connector | LOW–MED, **doable now** |
| **A2 — Public listing** | Anyone can add Proprietio from the Copilot/Agent marketplace | Partner Center + MACE ≥80 + publisher verification (+ SOC 2 for enterprise) | MED–HIGH, parallel |

A1 needs no engineering on our server — Copilot Studio adds an MCP connector pointing at
`https://mcp.proprietio.com/mcp` and authenticates through Entra federated to our OAuth.
A2 is paperwork + attestations, mostly non-engineering.

---

## 1. What reuses as-is

Same MCP server, same 18 tools, same `structuredContent` + annotations Claude and ChatGPT
use. Copilot Studio's MCP connector speaks Streamable HTTP. **Zero server changes for A1.**
The only Copilot-specific concept is *how the user authenticates*: instead of registering
directly against our OAuth (DCR like ChatGPT), enterprise tenants authenticate through
**Entra ID**, which then federates to Proprietio.

---

## 2. Path A1 — technical wiring (doable now)

### 2.1 Entra ID app registration (Proprietio side, one-time)
- Register a **multi-tenant** Entra app ("Proprietio for Microsoft 365").
- Redirect/callback URIs for the Copilot Studio connector auth flow.
- Expose the same six permission concepts as Entra **delegated scopes**, mapped 1:1 to our
  OAuth scopes (table §4).
- Publisher domain verification: **DNS TXT on `proprietio.com`** (also required for A2).

### 2.2 Federation bridge: Entra `tid` → Proprietio `organizationId`
Our multi-tenancy is **token-based, not URL-based** (no `/{workspace}/mcp`). Entra is just a
federation layer on top of the model that already ships:

```
Copilot user → Entra ID (tenant tid, user oid, granted scopes)
            → token presented to Proprietio OAuth / resource
            → resolve tid → organizationId  (same resolution table as the bearer flow)
            → /api/v1/* scoped to that org, scopes enforced per route
```

The resolution table (`Entra tid → Proprietio organizationId`) is the only new mapping; it
reuses the exact `token → organizationId` machinery already live for Claude/ChatGPT. Scope
enforcement stays at rentaly's `/api/v1/*` — unchanged.

### 2.3 Copilot Studio connector
- Add a **custom MCP connector** (or custom connector with the MCP action) targeting
  `https://mcp.proprietio.com/mcp`.
- Auth: OAuth 2.0 via the Entra app from §2.1.
- Surface the tools as a Copilot **agent**; optionally curate which of the 18 show (never
  rename — frozen contract). Recommend leading with the read tools; gate writes behind the
  two write scopes at consent.
- Test in your own M365 tenant before any marketplace step.

---

## 3. Path A2 — public listing & compliance dossier (parallel)

| Item | What it is | Owner | Status |
|---|---|---|---|
| Microsoft Partner Center account | Publisher identity for marketplace submission | Yohan | ⬜ create / verify |
| Publisher domain verification | DNS TXT on `proprietio.com` | Yohan | ⬜ (shared with §2.1) |
| **MACE** (Microsoft 365 App Compliance) | Tiered attestation; aim **Publisher Attestation → Tier ≥80** | Yohan + counsel | ⬜ |
| Data handling / DPA | Where data flows, retention, sub-processors | counsel | ◐ partial — `ApiAccessLog` trail exists |
| **SOC 2 Type II** | Enterprise procurement gate (not strictly required to list, required to *sell* to enterprise) | external auditor | ◐ in progress, Q3 2026 |
| Privacy policy + ToS URLs | public, reachable | Yohan | ⬜ confirm live |
| Security contact + responsible disclosure | `security@proprietio.com` | — | ✅ |
| Listing collateral | name, logo, descriptions, screenshots | Yohan | reuse ChatGPT packet §1 |

**Sequencing reality:** A1 can be demoed in a pilot tenant immediately. A2's marketplace
listing should not be promised on a near date — MACE + Partner Center review run on
Microsoft's clock, and the genuinely enterprise deals will ask for SOC 2 Type II (Q3 2026).

---

## 4. Scope mapping (OAuth ⇄ Entra delegated)

Same six-scope vocabulary as Claude/ChatGPT; Entra delegated scopes mirror them 1:1. rentaly
remains the enforcement boundary regardless of which front door the user came through.

| Proprietio OAuth scope | Entra delegated scope | Tools |
|---|---|---|
| `properties:read` | `Properties.Read` | search/get property, list units, get lease |
| `tenants:read` | `Tenants.Read` | list residents |
| `accounting:read` | `Accounting.Read` | rent roll, delinquency, P&L, balance sheet, GL, NOI |
| `maintenance:read` | `Maintenance.Read` | search/get work order, list vendors |
| `maintenance:write` | `Maintenance.Write` | create/update/close work order |
| `communications:write` | `Communications.Write` | send message |

---

## 5. Reviewer / pilot runbook

Once the Copilot Studio agent is wired in a test M365 tenant:

1. In Copilot, invoke the Proprietio agent.
2. Entra consent → grant the read scopes (writes opt-in).
3. Same validated prompts as the ChatGPT packet §4 (they're channel-agnostic):
   - *"Search my Proprietio properties."*
   - *"Delinquency aging by property this month."*
   - *"NOI for [demo property] last month."*
   - *"Open work orders older than 7 days."*
4. Scope-denial demo: read-only consent → ask to create a work order → 403 naming
   `maintenance:write` (Entra `Maintenance.Write`).

---

## 6. Checklist

**A1 — wiring (now):**
- [ ] Entra multi-tenant app registered; redirect URIs set.
- [ ] Six Entra delegated scopes defined, mapped 1:1 to OAuth scopes.
- [ ] `Entra tid → organizationId` resolution wired (reuses the bearer→org machinery).
- [ ] Publisher domain DNS TXT verified on `proprietio.com`.
- [ ] Copilot Studio MCP connector → `https://mcp.proprietio.com/mcp`, OAuth via Entra app.
- [ ] End-to-end test in own M365 tenant (read + a write).

**A2 — listing/compliance (parallel):**
- [ ] Partner Center account created/verified.
- [ ] MACE: Publisher Attestation submitted; target Tier ≥80.
- [ ] DPA + data-handling disclosure drafted with counsel.
- [ ] SOC 2 Type II progressing (Q3 2026).
- [ ] Listing collateral reused from `chatgpt-apps-sdk-submission.md` §1.
- [ ] Reviewer credentials shared via Microsoft's secure channel — **never** committed.

---

## 7. Decisions still open (flag for Yohan)

1. **Pilot tenant**: which M365 tenant do we wire A1 in first (Proprietio's own, or a design
   partner's)? Drives the Entra app's home tenant config.
2. **Marketplace timing**: commit to A2 now, or demo A1 to enterprise prospects 1:1 and only
   pursue the public listing once one pilot converts? (Cheaper to defer MACE until there's
   pull.)
3. **SOC 2 framing**: list on Copilot *before* SOC 2 Type II lands (possible — MACE doesn't
   strictly require it) vs. wait so the first enterprise security review doesn't stall.
