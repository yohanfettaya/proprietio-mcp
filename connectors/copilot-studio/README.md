# Proprietio → Microsoft Copilot Studio (MCP custom connector)

Ready-to-import definition that adds the **live Proprietio MCP server** to a
Microsoft Copilot Studio agent. This is **Path A1** (pilot wiring) from
`docs/copilot-submission.md`: it reuses the same MCP server and the same OAuth
2.1 Authorization Server (rentaly, `api.proprietio.com`) that Claude and ChatGPT
already use. **No server code is required** — the server is verified Copilot-ready
(the AS accepts Power Platform's `global.consent.azure-apim.net/redirect` redirect
URI; DCR + authorize confirmed live 2026-05-31).

- `proprietio-mcp.swagger.yaml` — the custom-connector definition (OpenAPI 2.0 +
  the `x-ms-agentic-protocol: mcp-streamable-1.0` MCP marker).

---

## Why a custom connector (and not Entra federation) for the pilot

Copilot Studio reaches a remote MCP server through a **Power Platform custom
connector**. For a pilot in your own M365 tenant, authenticate with **Generic
OAuth 2.0** pointed straight at `api.proprietio.com` — the user signs in on
`app.proprietio.com` at consent, exactly like the ChatGPT connector. Full Entra ID
SSO (`tid → organizationId` federation) is only needed when an enterprise customer
wants their employees to use Proprietio **without** a separate Proprietio login —
build that when a real tenant pulls for it (plan: `docs/copilot-submission.md` §2.2).

---

## One-time: register the connector's OAuth client

Power Platform custom connectors need a **pre-registered** OAuth client (Client ID
+ Client Secret) — they don't do Dynamic Client Registration. Mint one against our
AS, **locally**, and keep the secret out of any chat/commit:

```bash
curl -s -X POST https://api.proprietio.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Microsoft Copilot Studio",
    "redirect_uris": ["https://global.consent.azure-apim.net/redirect"],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "client_secret_basic"
  }'
```

The response contains `client_id` and `client_secret`. **Store the secret in a
password manager** — you'll paste both into the connector below. (Treat it like any
production secret: never commit it, never paste it into a conversation.)

> Note: `https://global.consent.azure-apim.net/redirect` is Power Platform's global
> OAuth redirect. If your environment shows a different redirect URL on the
> connector's Security tab, re-run the registration with that exact value (our AS
> validates `redirect_uri` strictly).

---

## Import & configure (Copilot Studio / Power Apps)

1. **Create the custom connector from the definition**
   - Power Apps / Power Automate → **Custom connectors** → **New custom connector**
     → **Import an OpenAPI file** → upload `proprietio-mcp.swagger.yaml`.
   - (Or in Copilot Studio: agent → **Tools** → **Add a tool** → **New tool** →
     **Custom connector**, then create it from the file.)
2. **Security tab** — it should already read OAuth 2.0 from the file. Fill in:
   - **Identity Provider**: Generic OAuth 2.0
   - **Client id / Client secret**: from the registration step above
   - **Authorization URL**: `https://api.proprietio.com/oauth/authorize`
   - **Token URL**: `https://api.proprietio.com/oauth/token`
   - **Refresh URL**: `https://api.proprietio.com/oauth/token`
   - **Scope**: `properties:read tenants:read accounting:read maintenance:read`
     (add `maintenance:write communications:write` only when you want writes)
   - **Enable PKCE / code challenge: S256** if the option is shown.
3. **Create connector**, then **New connection** → you'll be redirected to
   `app.proprietio.com` to sign in and consent. Approve the read scopes.
4. **Add to your agent** in Copilot Studio and publish to your test tenant.

---

## Validate (reviewer / pilot runbook)

Same channel-agnostic prompts as the ChatGPT packet:

1. *"Search my Proprietio properties."* → `proprietio_search_properties`
2. *"Delinquency aging by property this month."* → `proprietio_get_delinquency`
3. *"NOI for [demo property] last month."* → `proprietio_get_noi`
4. *"Open work orders older than 7 days."* → `proprietio_search_work_orders`

**Scope-denial demo:** connect with read-only consent, then ask Copilot to *create a
work order* → expect a `403` naming `maintenance:write`. Re-consent with the write
scope to enable it.

---

## Notes & gotchas

- **18 tools, frozen names.** The `proprietio_*` names are the public contract
  (root `CLAUDE.md` §8). Curate *which* tools the agent surfaces if you like; never
  rename.
- **Cold start.** The MCP server is on Render's free tier — the first call after
  ~15 min idle can take ~30s. Fine for a pilot; move to a paid tier before any
  serious rollout.
- **`x-ms-agentic-protocol`.** This extension is what flips the connector into MCP
  mode. If a Copilot Studio update changes the accepted value, update it here.
- **Public marketplace listing (Path A2)** — Partner Center + MACE + SOC 2 — is a
  separate, paperwork-gated track; see `docs/copilot-submission.md` §3. This
  connector is for **your own / pilot tenants**, demoable immediately.
