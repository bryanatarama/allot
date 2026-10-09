# Allot — working notes for Claude

> ⚠️ **This file is mirrored to `~/Dropbox/allot-docs/CLAUDE.md`.** When you edit this file, copy it over to the Dropbox path (or vice versa). They should stay identical — the Dropbox copy exists so Bryan can work on Allot from any machine with Dropbox synced (even without a fresh `git pull`). Not a symlink because git symlinks break across machines.

Personal budgeting web app. Live at **myallot.money**. Repo: github.com/bryanatarama/allot.

## Read these first (before touching anything)

1. **`~/Dropbox/allot-docs/BUDGETER_PROJECT_REFERENCE_v9.md`** — full project reference. Architecture, KV keys, endpoint map, feature history, gotchas, deploy paths. Lives in Dropbox (syncs across machines) and is intentionally gitignored, so a git clone of this repo will NOT have it. READ THIS BEFORE MAKING NON-TRIVIAL CHANGES.
2. This file (`CLAUDE.md`) — deploy workflow + standing rules only. Short.
3. Code:
   - `~/budgeter/index.html` — the frontend runtime (in this repo)
   - `~/budgeter/worker/worker.js` — Cloudflare Worker (gitignored — has inline Discord webhooks. Deploy with `cd ~/budgeter/worker && npx wrangler deploy`)
   - `~/budgeter/worker/plaid.js` — Plaid bank-linking module imported by worker.js (gitignored with worker/). `worker/package.json` pulls in `jose`; run `npm install` in worker/ on a fresh machine before deploying.
   - `~/budgeter/PLAID_PLAN.md` — durable state of the Plaid integration (scope, human tasks, how to test). **Before changing any Plaid-touching code, consult the Plaid MCP `build_guidance`, and re-run `build_check_acceptance` before calling the change done.**
   - `~/budgeter/ideas-app/index.html` — separate mini-app deployed to `budgeter-ideas.pages.dev` (also gitignored)

## Session start on EITHER machine (METROPLEX/PC or SOUNDWAVE/Mac) — do this before any Allot work
Code syncs through GitHub only. Docs sync through `~/Dropbox/allot-docs/`. Nothing syncs through a repo copy in Dropbox — never keep one there.
1. `git pull --ff-only` in `~/budgeter`. If it is not a fast-forward, stop and tell Bryan — the other machine has unpushed work.
2. Compare the reference doc stamp with the live build:
   `sed -n 3p ~/Dropbox/allot-docs/BUDGETER_PROJECT_REFERENCE_v9.md` vs `curl -sL https://budgeter-app.pages.dev | grep -o 'BUILD_STAMP = "[^"]*"'`
   If they differ, the other machine shipped without stamping: read `git log` for the missing versions, add a changelog note per version to the reference doc, fix the stamp line, and run `bash push-ref.sh` (Mac) so the KV copy matches. If Dropbox hangs, the KV copy is at `?api=refGet` on the Worker.
3. Confirm the Dropbox `CLAUDE.md` mirror is identical to the repo copy (`diff CLAUDE.md ~/Dropbox/allot-docs/CLAUDE.md`). Copy the newer one over the older.
4. If the session touches the Worker or Plaid: `cd worker && npx wrangler deployments list | tail`. `worker/` is gitignored, so a deploy from the other machine will NOT be in your local files — ask Bryan before editing if the cloud deploy is newer than your local `worker/*.js`.
5. Read the reference doc's newest changelog entries so you know what the other machine shipped.

When you finish: bump BUILD_STAMP, deploy, stamp + annotate the reference doc, commit, push. If you edited this `CLAUDE.md`, copy it to `~/Dropbox/allot-docs/CLAUDE.md` so the mirror matches (`cp CLAUDE.md ~/Dropbox/allot-docs/CLAUDE.md`) — committing the repo copy alone leaves the Dropbox mirror stale until the other machine's session-start step 3 catches it. Verify the stamp line actually changed — on Windows the `$HOME/Dropbox` path in `push-pages.sh` may not resolve and the stamp step silently skips.

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
