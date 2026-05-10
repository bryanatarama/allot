# Allot

A personal budgeting web app. Live at [myallot.money](https://myallot.money).

Allot helps you allocate every dollar of every paycheck across categories, bills, and savings goals — and then tracks what you actually spend against those allocations.

## Features

- **Per-paycheck allocation.** Configure each category as a percent or fixed amount of your paycheck; Allot computes the deposit for every pay period.
- **Bills tracking with paid state.** Bills get a green "Paid" cell when met by the configured deposit, with a popup walking you through the math.
- **Cross-device sync.** All user state lives in Cloudflare Worker KV under per-user keys; sign in on any device and pull your data.
- **Guided onboarding.** A 17-step slides + spotlight tour introduces the layout to new users.
- **Hardened auth.** Bearer-token sessions, PBKDF2 password hashing, rate-limited login/signup, locked CORS, 30-day session expiry.

## Architecture

- **Frontend** — single `index.html` (~7,300 lines, vanilla JS) served via Cloudflare Pages.
- **Backend** — Cloudflare Worker (not in this repo; see note below) handles auth, KV reads/writes, feedback, and screenshots in R2.
- **Storage** — Cloudflare KV for user state and auth records; R2 for screenshot uploads.

The Cloudflare Worker source is **not currently included** in this repo because it has an inline secret that needs to be moved to environment variables before publishing. The frontend calls a public worker URL (`lingering-truth-5f8b.bryanatarama.workers.dev`) — you can see the API surface in `index.html` if you're curious about the protocol.

The `.js` files in this repo (`Code.js`, `Config.js`, `WebApp.js`, etc.) are **legacy Google Apps Script** kept for reference. They were the original backend before the migration to Cloudflare Worker KV. They are no longer used at runtime.

## Deploy

```bash
bash push-pages.sh
```

This bumps the build stamp and deploys `index.html` + `_headers` to the `budgeter-app` Cloudflare Pages project. Requires `npx wrangler` and Cloudflare auth on the deploying machine.

To run your own copy you'd need to:

1. Create your own Cloudflare Pages project and update the project name in `push-pages.sh`.
2. Stand up your own Worker (the API surface is documented inline; see "Architecture" above).
3. Update the `connect-src` in `_headers` and any worker URLs in `index.html` to point at your worker.

## Status

Active. Built solo by [Bryan Atarama](https://github.com/bryanatarama). Beta — public sign-up is open.

## License

MIT — see [LICENSE](LICENSE).
