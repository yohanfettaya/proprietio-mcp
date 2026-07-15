# OpenAI Review Remediation - Proprietio

Status: 2026-07-15. The Codex plugin page shows `Proprietio` version `1.0.0` as
`Rejected`.

## What I verified locally

- The cached remote Codex plugin manifest is schema-valid:
  `~/.codex/plugins/cache/created-by-me-remote/dev-6a1c2021be6481919a88c87e25546b2c/1.0.0`.
- The cached manifest is generic and under-specified:
  - developer name is `App developer`
  - description/long description are only `Proprietio`
  - capabilities are empty
  - no website, privacy policy, terms, or support metadata is present in the cached plugin manifest
- The Codex app tool cache for `asdk_app_6a1c2021be6481919a88c87e25546b2c` has unsafe-looking
  annotations for the submitted snapshot:
  - many read-only tools are surfaced with `destructiveHint:true`
  - `proprietio_update_work_order` and `proprietio_close_work_order` are also surfaced with
    `destructiveHint:true`, which is acceptable if their justifications describe existing-record
    mutations
  - only `proprietio_send_message` should be `openWorldHint:true`
- The source repo has the intended conservative mapping in `src/tools/*` and the contract test
  passes with `npm test`: read tools and create are non-destructive; update, close, and send are
  destructive; only send is open-world.
- The live endpoint is correctly OAuth-protected; unauthenticated `tools/list` returns `401`.
- The submitted runbook used placeholders and relative wording (`[demo property]`, `this month`,
  `last month`) instead of concrete review inputs and expected values.
- The local mock accounting path had a timezone-sensitive date bug: `2026-05-01` could parse as
  April 30 in local time, causing "May 2026" NOI to return `months: 2` instead of `months: 1`.

## Likely rejection causes

Treat this as both a deterministic-output issue and a safety/listing mismatch.

The clearest test-case mismatch is the May 2026 NOI prompt: a one-month period could produce a
two-month result in non-UTC environments. That would make the submitted expected output fail even
when the tool call itself succeeds.

The submitted test prompts were also under-specified. Reviewers should not have to infer IDs,
period boundaries, or what "last month" means. OpenAI asks for test cases whose expected behavior is
clear and unambiguous.

Separately, the submitted snapshot looks too risky to a reviewer if read-only property, resident,
accounting, and maintenance lookups are marked destructive. The work-order update/close tools can
remain conservatively destructive as long as the justifications say they mutate existing operational
records.

The generic listing metadata makes the review story weaker: it does not explain tenant scoping,
OAuth scopes, audit logging, read-vs-write boundaries, privacy policy, or support routes.

## Fix before resubmission

1. Deploy the accounting date fix and rerun `npm test`. The reviewer contract test asserts
   `proprietio_get_noi({ scope_id:"prop_001", period_start:"2026-05-01", period_end:"2026-05-31" })`
   returns one month: revenue `$6,864`, opex `$2,883`, NOI `$3,981`.
2. Replace relative/placeholder submission test cases with the exact §4 prompts and expected
   outcomes in `docs/chatgpt-apps-sdk-submission.md`.
3. Regenerate or refresh the OpenAI app/plugin submission from the current MCP server code, not
   from the stale rejected snapshot.
4. With a reviewer/demo OAuth token, call live `tools/list` against
   `https://mcp.proprietio.com/mcp` and verify:
   - read tools: `readOnlyHint:true`, `destructiveHint:false`, `openWorldHint:false`
   - `proprietio_create_work_order`: `readOnlyHint:false`, `destructiveHint:false`,
     `openWorldHint:false`
   - `proprietio_update_work_order` and `proprietio_close_work_order`: `readOnlyHint:false`,
     `destructiveHint:true`, `openWorldHint:false`
   - `proprietio_send_message`: `readOnlyHint:false`, `destructiveHint:true`,
     `openWorldHint:true`
5. Use the listing fields in `docs/chatgpt-apps-sdk-submission.md` instead of the generic values
   from the rejected snapshot.
6. In the submission notes, state plainly that write scopes are opt-in:
   `maintenance:write` for work orders and `communications:write` for resident/vendor messages.
7. Include the scope-denial demo from the reviewer runbook: connect with read scopes only, then
   request a write action and show the expected `403 insufficient_scope`.

## Paste-ready review note

Proprietio connects ChatGPT to a user's own property-management portfolio through OAuth 2.1.
Read tools are limited to the authenticated user's organization and do not mutate data. Work-order
writes require the optional `maintenance:write` scope: creating a work order is additive, while
updating or closing one is conservatively marked destructive because it changes an existing
operational record. Resident/vendor messages require the optional `communications:write` scope and
are the only open-world action because a message reaches a real recipient and cannot be un-sent.
Every request is scoped server-side by organization and audit-logged by tool, user, status, and
latency.

## Verification already run

```bash
npm test
npm run build
```

Both passed locally on 2026-07-15.
