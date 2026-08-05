# Allot — working notes for Claude

> ⚠️ **This file is mirrored to `~/Dropbox/allot-docs/CLAUDE.md`.** When you edit this file, copy it over to the Dropbox path (or vice versa). They should stay identical — the Dropbox copy exists so Bryan can work on Allot from any machine with Dropbox synced (even without a fresh `git pull`). Not a symlink because git symlinks break across machines.

Personal budgeting web app. Live at **myallot.money**. Repo: github.com/bryanatarama/allot.

## Read these first (before touching anything)

1. **`~/Dropbox/allot-docs/BUDGETER_PROJECT_REFERENCE_v9.md`** — full project reference. Architecture, KV keys, endpoint map, feature history, gotchas, deploy paths. Lives in Dropbox (syncs across machines) and is intentionally gitignored, so a git clone of this repo will NOT have it. READ THIS BEFORE MAKING NON-TRIVIAL CHANGES.
2. This file (`CLAUDE.md`) — deploy workflow + standing rules only. Short.
3. Code:
   - `~/budgeter/index.html` — the frontend runtime (in this repo)
   - `~/budgeter/worker/worker.js` — Cloudflare Worker (gitignored — has inline Discord webhooks. Deploy with `cd ~/budgeter/worker && npx wrangler deploy`)
   - `~/budgeter/ideas-app/index.html` — separate mini-app deployed to `budgeter-ideas.pages.dev` (also gitignored)

## Architecture (don't relearn this each session)
- **The runtime is the single `index.html`** (~9k lines, vanilla JS) served via Cloudflare Pages.
- The `.js` files (`Code.js`, `WebApp.js`, `Config.js`, etc.) are **dead legacy Google Apps Script** — NOT used at runtime. Make all app changes in `index.html`.
- Backend is a Cloudflare Worker at `~/budgeter/worker/worker.js`; user state lives in Worker KV.

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

## Prod URLs
- Main app: `myallot.money` (also `budgeter-app.pages.dev`)
- Ideas app: `budgeter-ideas.pages.dev`
- Worker: `lingering-truth-5f8b.bryanatarama.workers.dev`
- Cloudflare Pages projects: `budgeter-app`, `budgeter-ideas`
