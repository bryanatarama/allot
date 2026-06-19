# Allot — working notes for Claude

Personal budgeting web app. Live at **myallot.money**. Repo: github.com/bryanatarama/allot.

## Architecture (don't relearn this each session)
- **The runtime is the single `index.html`** (~7k lines, vanilla JS) served via Cloudflare Pages.
- The `.js` files (`Code.js`, `WebApp.js`, `Config.js`, etc.) are **dead legacy Google Apps Script** — NOT used at runtime. Make all app changes in `index.html`.
- Backend is a Cloudflare Worker (not in this repo); user state lives in Worker KV.

## Deploy workflow
- Deploy with `bash push-pages.sh` — deploys `index.html` + `_headers` to the `budgeter-app` Pages project, then auto-stamps the reference doc. Requires Cloudflare auth (`wrangler login`, from a real terminal — it can't be done from a non-interactive shell).
- `push-pages.sh` is cross-platform (macOS + Windows git-bash).
- If you ever deploy by running the `wrangler pages deploy` line directly instead of the full script, you MUST also run the doc-stamp step — or just run the full script.

## When you ship a code change — ALWAYS do all of these:
1. Bump `BUILD_STAMP` in `index.html` (`vNNN-pages` → next number).
2. Deploy, then verify the live `BUILD_STAMP` on myallot.money.
3. Keep the reference doc current at `~/Dropbox/allot-docs/BUDGETER_PROJECT_REFERENCE_v9.md`:
   - The `Last updated | BUILD_STAMP` line auto-updates via `push-pages.sh`.
   - For **behavior/content changes, add a short note yourself** (a script can't write prose). This doc is the shared source of truth across machines — keep it accurate.
4. Commit and push to `origin/main`.

## Key references
- **Full project reference** (architecture, KV keys, function map, gotchas): `~/Dropbox/allot-docs/BUDGETER_PROJECT_REFERENCE_v9.md`. Lives in Dropbox (syncs across machines; intentionally gitignored, not in this public repo).
- Prod: myallot.money / budgeter-app.pages.dev. Cloudflare Pages project: `budgeter-app`.
