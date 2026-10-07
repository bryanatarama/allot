# PLAID_PLAN.md — Allot bank linking

Durable state of the Plaid build across sessions. Rule IDs (GUIDE-*, TXN-*, CHECK-*…)
refer to the Plaid build-kit guidance served by the Plaid MCP server.

## Goal

Add bank-account linking to Allot, a personal budgeting web app (myallot.money), so
users can pull real transactions and balances into their budget instead of entering
them manually. (workflow_id: wf_d61e6f13700562e5)

## Scope

- Products (confirmed by Bryan 2026-10-07):
  - **transactions** — cash and card activity via `/transactions/sync`; daily balances
    come free via `/accounts/get` (SELECT-001/005).
  - **identity** (used as `/identity/match`) — yes/no "does this account belong to the
    user" signal without storing PII (SELECT-004, IDENT-002). Allot only had
    username+password, so the Accounts tab collects the user's legal name once.
  - **investments** — brokerage/retirement holdings for a complete picture (SELECT-005).
  - **liabilities** — credit-card and loan balances, APRs, minimums; feeds the Debt tab
    (SELECT-005, LIAB-007).
- Rejected: **balance** product (per-call billing, only for a refresh-now action,
  BAL-001/002); **recurring transactions** add-on (add-later candidate for bills and
  subscriptions, TXN-016 — `days_requested` already set to 180 so it can be added
  without relinking, TXN-017).
- Scope answers: US only; no money movement; no lending decision; verification =
  account ownership only.
- Link configuration (decided from guidance, not a user question):
  `products: ["transactions"]`, `required_if_supported_products: ["identity"]`
  (IDENT-009), `additional_consented_products: ["investments","liabilities"]`
  (LIAB-007/INV-015), `transactions.days_requested: 180`, `webhook` = worker
  `/plaid/webhook`, `redirect_uri` only when `PLAID_REDIRECT_URI` is set (OAUTH-002/005).
- Platform: web / vanilla JS single-page `index.html` on Cloudflare Pages + Cloudflare
  Worker backend (`worker/worker.js` + `worker/plaid.js`) with Workers KV.
- Environment: **sandbox** until acceptance passes (`PLAID_ENV` var in `wrangler.toml`).
  The Link client takes its environment from the link_token, so the Worker var is the
  single source of truth (GUIDE-004).

## Dashboard state (Bryan's individual Plaid account, read 2026-10-07 via dashboard_get_state)

- authorized_environments: production, sandbox
- production_by_country US: assets, auth, balance, identity, identity_match,
  investments, investments_refresh, liabilities, recurring_transactions, signal,
  statements, transactions, transactions_refresh → every product in scope is enabled
  (TASK-007 satisfied). recurring_transactions is also enabled for later.
- link_customizations: default only. layer_templates: none (not in scope).
- redirect_uris: **empty**. webhooks: **empty** (Plaid's dashboard list; the receiver
  URL is set per Item via `/link/token/create`, which this build does).

## Human tasks

| Task | Why it matters | Where | State |
|------|----------------|-------|-------|
| Set worker secrets `PLAID_CLIENT_ID` and `PLAID_SECRET` (sandbox) via `npx wrangler secret put …` **from a real terminal** (through the Claude Code `!` prompt there is no TTY and an empty value gets stored) | Nothing works until set; routes return 503 "not configured" (GUIDE-001) | https://dashboard.plaid.com/developers/keys | verified 2026-10-07 (link/token/create succeeds; `plaidStatus` reports well-formed 24-hex / 30-hex values) |
| `PLAID_TOKEN_KEY` (32-byte AES-GCM key for access tokens at rest) | DATA-001 encryption at rest | generated locally and piped into `wrangler secret put` without being displayed | verified 2026-10-07 (tokens encrypt/decrypt in sandbox link + sync) |
| Register OAuth redirect URI `https://myallot.money/plaid-oauth` (exact match, no query/fragment) then set `PLAID_REDIRECT_URI` var and redeploy worker | Without it OAuth banks (Chase, BofA, …) silently vanish from Link in production (OAUTH-001/009). | https://dashboard.plaid.com/developers/api → Allowed redirect URIs | verified 2026-10-07 (dashboard_get_state lists it; Platypus OAuth Bank linked end to end through the redirect) |
| Confirm Data Transparency Messaging / use-case setup is complete | `INVALID_LINK_CUSTOMIZATION` on link/token/create usually means it isn't (PITFALL-002) | https://dashboard.plaid.com/link | not_applicable for the sandbox build (link/token/create succeeds in sandbox); re-open at production cut-over, cannot be read via the tools (TASK-006) |
| Company profile + data-security questionnaire | Gates Chase/PNC OAuth in production (OAUTH-008, TASK-006) | https://dashboard.plaid.com/settings/company | not_applicable for the sandbox build; re-open at production cut-over (not readable via the tools) |
| Switch `PLAID_ENV` to `production` and set the production `PLAID_SECRET` | Separate configuration, not a flag flip (TASK-008) | wrangler.toml + secrets | not_applicable for the sandbox build; this is the production cut-over step (see Production checklist) |

## Implementation checklist

- [x] `worker/plaid.js` — Plaid module (import in `worker.js`), `jose` for webhook JWT
      verification (WEBHOOK-003/004). `worker/package.json` added (worker/ is gitignored).
- [x] `?api=plaidStatus` — env + whether a legal name is on file.
- [x] `?api=plaidLinkToken` — just-in-time link_token (DATA-004); update mode when
      `item_id` is passed (ITEM-003, OAUTH-005). Saves `legalName` when provided.
- [x] `?api=plaidExchange` — duplicate-institution guard before exchange (ITEM-011),
      exchange, persist encrypted token + item_id + link_session_id BEFORE anything
      else (GUIDE-013/015, WEB-003), `/accounts/get` synchronously (ITEM-014), then
      first `/transactions/sync` + liabilities + holdings + `/identity/match` in
      `ctx.waitUntil` (TXN-003).
- [x] `?api=plaidItems` — public item view (no tokens, GUIDE-002) + merged recent
      transactions.
- [x] `?api=plaidSync` — refresh from Plaid's cache; never calls `/transactions/refresh`
      (TXN-010). Per-item KV lock (ITEM-013).
- [x] `?api=plaidRemove` — `/item/remove` then purge (ITEM-005).
- [x] `?api=plaidRelinked` — after update-mode success: no exchange, clear error, re-sync.
- [x] `?api=plaidSandbox` — sandbox-only `reset_login` / `fire_webhook` (SANDBOX-004/005).
- [x] `POST /plaid/webhook` — JWT-verified (ES256, kid cache, 5-min iat, raw-body
      sha256 constant-time), 200 fast, work in waitUntil, routed by item_id → username
      (DATA-005). Handles TRANSACTIONS.SYNC_UPDATES_AVAILABLE, LIABILITIES/HOLDINGS
      DEFAULT_UPDATE, ITEM.ERROR / PENDING_DISCONNECT / PENDING_EXPIRATION /
      LOGIN_REPAIRED / USER_PERMISSION_REVOKED / NEW_ACCOUNTS_AVAILABLE (WEBHOOK-005/006).
- [x] `/transactions/sync`: cursor-based, count 500, all pages buffered then one KV
      write with cursor (TXN-002/011), added/modified/removed handled (TXN-004),
      MUTATION_DURING_PAGINATION restart (TXN-007), 24-month prune.
- [x] Error handling: branch on error_code (ITEM-002), retry with jittered backoff for
      INSTITUTION_DOWN / NOT_RESPONDING / PRODUCT_NOT_READY / RATE_LIMIT (ITEM-004),
      ITEM_LOGIN_REQUIRED → status login_required → Reconnect button (update mode).
- [x] Frontend (`index.html` v436): Accounts tab, Plaid Link SDK from cdn.plaid.com
      (WEB-010), CSP updated in `_headers` (WEB-006), pre-initialised handler
      (WEB-001/CONV-003), open on gesture, onSuccess → exchange, onExit distinguishes
      abandonment vs error (WEB-003), handler destroyed/recreated after use (WEB-011),
      OAuth resume at `/plaid-oauth` with `receivedRedirectUri` + persisted link_token
      (OAUTH-003/004, WEB-004), funnel events to console (CONV-014 — no analytics
      backend in Allot).
- [x] Liabilities → Debt tab: per-account "Fills Debt → <category>" mapping stored in
      KV key `plaidDebtMap`; balances/APR/min auto-applied on load unless the Debt tab
      has unsaved edits.
- [x] Sandbox end-to-end test 2026-10-07 (Patelco Credit Union sandbox, user_good):
      link → 2 accounts, 49 txns, historical complete, identity match score 100;
      `/sandbox/item/fire_webhook` → receiver verified JWT, synced (last_sync advanced);
      `/sandbox/item/reset_login` → card "Needs reconnect" → Reconnect (update mode,
      no re-exchange) → Connected; Remove → `/item/remove` + purge. Second data shape:
      all 14 account types → liabilities (credit/student/mortgage), 13 holdings,
      institution logo/color; "Fills Debt" mapping applied balance/APR/min to a Debt
      row and was restored.
- [x] GUIDE-017: institution name/logo/color now come from `/institutions/get_by_id`
      at link time and on full syncs.
- [x] Removed the KV-based per-item sync lock: KV reads are edge-cached (~60 s) so it
      was unreliable; concurrent syncs are safe (cursor-based, whole-value writes,
      idempotent upserts).
- [x] Acceptance check round 1 (see below).
- [x] v439 (2026-10-07): state moved from KV to a per-user Durable Object (`PlaidUser`,
      `[[durable_objects.bindings]] PLAID_USER`, migration `v1-plaid-do`); one-time import
      of the old KV layout on first access. Link-failure message now survives the reload.
- [ ] Production cut-over (see checklist below).

## Production checklist (not started)

1. Dashboard: confirm Data Transparency Messaging / use case and company profile +
   data-security questionnaire (gates Chase/PNC OAuth).
2. Production credentials: `npx wrangler secret put PLAID_SECRET` with the **Production**
   secret, from a real terminal.
3. `wrangler.toml`: `PLAID_ENV = "production"`; redeploy. The redirect URI allowlist is
   environment-independent in the Dashboard but re-check it.
4. `index.html`: the Accounts tab becomes visible to all users automatically when
   `plaidStatus` reports `env: "production"`.
5. Link a real institution (Chase first, CONV-013), verify OAuth, then re-run
   `build_check_acceptance`.
6. Existing sandbox Items are invalid in production: remove them from the Accounts tab
   before switching (or they will show as errors).

## Acceptance

- Round 1 (2026-10-07, sandbox): CHECK-001/002/003/004/005/006/008/010/011/012/013/
  014/015 passed with evidence. CHECK-007 failed (OAuth redirect URI not yet registered
  or passed — sandbox test used a non-OAuth institution; needs_human before
  production). CHECK-009 failed only because two production-gated tasks remain
  needs_human / cannot_verify by design (TASK-006). Verdict applies to worker version
  deployed 2026-10-07 after the institution-lookup change and index.html v438.
- Round 2 (2026-10-07, sandbox, after the Durable Object move + redirect URI): all 15
  checks passed. OAuth exercised end to end with Platypus OAuth Bank (ins_127287).
  Verdict applies to worker deployed 2026-10-07 (DO migration v1-plaid-do) and
  index.html v439.
- Storage incident during round 1→2: with state in Workers KV, a Plaid webhook (Plaid's
  data center) and the browser (another data center) each read a ~60 s-stale cached copy
  and wrote the whole record back, silently losing the other's update (an OAuth-linked
  Item was dropped; a synced item regressed to its pre-sync state). Fixed by moving all
  Plaid state into a per-user Durable Object (`PlaidUser`, SQLite) with every mutation
  serialized; KV keeps only write-once routing/cache keys. One orphaned sandbox Item
  may exist at Plaid from the lost link; sandbox Items expire on their own.

## Maintenance

This integration is maintained with the Plaid MCP; this file is its durable state.
Agents working in this repository: consult build_guidance before modifying any
Plaid-touching code, and re-run build_check_acceptance before reporting such a change
as working. The acceptance above applies only to the code as it was verified — later
changes invalidate it.

## How to test

Sandbox only (`PLAID_ENV = "sandbox"`). Sign in at https://myallot.money as the owner
(admin mode on, "Preview as User" off) and open the **Accounts** tab.

### 1. Link a bank (credentials flow)
1. Tap **Add a bank account**. First time only: enter a name. In sandbox use
   `Alberta Bobbeth Charleson` (the sandbox account owner) so the ownership check passes.
2. In Plaid Link choose **Continue without phone number**.
3. Search **First Platypus Bank**, sign in with `user_good` / `pass_good`, select all
   accounts, finish.
4. Expected: a bank card with the institution logo, accounts and balances within a few
   seconds; **Connected** and **Ownership verified** pills; "Importing transactions…"
   clears within about a minute and **Recent Activity** fills (money in shows green).
   Credit/loan rows show APR · Min · Due.

### 2. Link an OAuth bank (redirect flow)
1. **Add a bank account** → **Continue without phone number** → search
   **Platypus OAuth Bank** (not Patelco / First Platypus).
2. Approve on the fake bank page. You are sent to myallot.money/plaid-oauth and Link
   resumes by itself.
3. Expected: a second bank card appears; pill reads "2 banks connected · sandbox".
   Picking a bank that is already connected is refused with "… is already connected".

### 3. Webhook
1. On a bank card tap **Sandbox: fire webhook**.
2. Expected: within ~5 s the card's "Synced …" time updates.

### 4. Reconnect (broken login)
1. Tap **Sandbox: break login** → card shows **Needs reconnect** and an explanation.
2. Tap **Reconnect**, sign in with `user_good` / `pass_good`.
3. Expected: card returns to **Connected**; "Synced" time advances.

### 5. Fill a Debt row from a credit card
1. On a credit-card or loan row pick **Fills Debt → <category>**.
2. Expected: the Debt tab's row shows that account's balance, APR, and minimum; it
   re-applies on every Accounts-tab visit while mapped (unless the Debt tab has unsaved
   edits). Pick "Not linked" to stop (values stay as last written).

### 6. Remove
1. Tap **Remove**, then **Confirm remove** (within 6 s).
2. Expected: card disappears, its transactions leave Recent Activity, the Item is
   removed at Plaid.

## Decisions made

- Route names (Bryan, 2026-10-07): `?api=plaidLinkToken|plaidExchange|plaidItems|plaidSync|plaidRemove`
  (+ `plaidStatus`, `plaidRelinked`, `plaidSandbox`), path `/plaid/webhook` on the
  worker, `/plaid-oauth` on myallot.money (Pages SPA fallback serves index.html).
- First pass = plumbing + Connected Accounts panel; deposit/bill matching later (Bryan).
- Panel lives in a new **Accounts** tab (Bryan: "put it in the accounts tab").
- Legal name collected once in the Accounts tab for `/identity/match` (Bryan confirmed
  Allot stores only username+password).

## Open questions

- Accounts tab visibility: current build shows it to everyone only when
  `PLAID_ENV=production`; in sandbox only admin mode (owner, not previewing) sees it.
- Next pass: match incoming deposits to "Post Deposit", and bill payments to Paid state.
