# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internal tool for VBI Customer Support to look up insurance certificates (GCN) via the iPay channel. Built with Next.js 16 App Router.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build + type check
npm run lint     # ESLint
npm run test     # Run Vitest test suite (run before every commit)

# Generate a secret for JWT_SECRET or SESSION_PASSWORD:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Local setup

Copy `.env.example` to `.env.local` and fill in all values before running `npm run dev`. In development, OTPs are logged to the server console instead of being emailed (see `src/lib/resend.ts`).

For Gmail SMTP, the `GMAIL_APP_PASSWORD` must be a Google App Password (not your account password). Generate at: Google Account → Security → 2-Step Verification → App Passwords.

**Dev OTP**: in development (`NODE_ENV !== "production"`) the OTP is printed to the terminal where `npm run dev` is running — check the server console, not email.

**Dev rate limiting**: rate limiting is bypassed entirely in development (`NODE_ENV !== "production"`) so the Netlify Blobs store is never contacted locally.

## Architecture

**Auth flow (stateless OTP — no database):**
1. `POST /api/auth/request-otp` — validates email domain, signs a 10-min JWT `{email, otp}`, sets it as an `httpOnly` cookie `otp_token`, sends the 6-digit OTP via Gmail SMTP (Nodemailer).
2. `POST /api/auth/verify-otp` — reads `otp_token` cookie, verifies JWT, compares OTP with `timingSafeEqual`, creates an `iron-session` cookie (`ipay_session`), clears `otp_token`.
3. Protected pages call `getIronSession(await cookies(), sessionOptions)` and `redirect('/login')` if no session. **`cookies()` is async in Next.js 16 — always `await` it.**

**Route protection (`src/proxy.ts`):**
The proxy middleware runs on all routes except `_next/static`, `_next/image`, `favicon.ico`, `/login`, `/api/auth/`, and static asset extensions (`.webp`, `.png`, `.jpg`, etc.). Static assets **must** be excluded from the matcher or the middleware will redirect unauthenticated requests (including public images like the logo) to `/login`.

**VBI API proxy (`src/lib/vbi-api.ts`):**
The upstream endpoint expects `P_OBJ_INPUT` as a Python-style single-quote dict string — use the template literal already in `vbiApiLookup`, not `JSON.stringify`. Inputs are sanitized with `.replace(/'/g, '')` before interpolation.

**MotherDuck / DuckDB (`src/lib/motherduck.ts`):**
- Uses `@duckdb/node-api` (native Node addon) to query MotherDuck cloud DuckDB.
- `DuckDBInstance` is a singleton — reused across requests to avoid re-authenticating on every call.
- On Netlify, `HOME` may be unset in serverless functions; the lib sets `process.env.HOME = "/tmp"` as a fallback before connecting.
- `libduckdb.so` is a native shared library loaded via `dlopen()` — nft cannot auto-trace it. `netlify.toml` uses `included_files = ["node_modules/@duckdb/**"]` to force-copy the entire `@duckdb` tree (including the `.so`) into the function bundle.
- MotherDuck has **no SQL-over-HTTP API** — the native client is the only supported way to run queries from Node.js.

**Rate limiting (`src/lib/rate-limit.ts`):**
Uses `@netlify/blobs` for distributed counters. Plain read-then-write (no CAS) — `@netlify/blobs` v8 removed `onlyIfMatch`/`onlyIfNew`. Fails closed by default (blocks on storage error); pass `failOpen=true` to invert.

**Key files:**
- `src/lib/session.ts` — iron-session config and `SessionData` type
- `src/lib/otp-jwt.ts` — `signOtpToken` / `verifyOtpToken` using `jose` HS256
- `src/lib/vbi-api.ts` — `vbiApiLookup` wraps the VBI external API
- `src/lib/resend.ts` — `sendOtpEmail` via Gmail SMTP (Nodemailer); no-ops in development
- `src/lib/motherduck.ts` — singleton DuckDB/MotherDuck connection; `getPaymentHistory(certNo)`
- `src/lib/rate-limit.ts` — Netlify Blobs-backed sliding-window rate limiter
- `src/proxy.ts` — Next.js middleware (exported as `proxy`, not `middleware`)
- `src/components/search/SearchForm.tsx` — main search UI with results state machine
- `src/app/api/insurance/lookup/route.ts` — auth-guarded proxy to VBI
- `src/app/api/insurance/payment-history/route.ts` — auth-guarded MotherDuck query

## Environment variables

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs OTP JWTs (32+ chars) |
| `SESSION_PASSWORD` | Encrypts iron-session cookie (32+ chars, different from JWT_SECRET) |
| `ALLOWED_EMAIL_DOMAIN` | Only emails from this domain can log in (e.g. `vbi.com.vn`) |
| `GMAIL_USER` | Gmail address used to send OTP emails |
| `GMAIL_APP_PASSWORD` | Google App Password for `GMAIL_USER` (not the account password) |
| `VBI_API_KEY` | API key for `openapi.evbi.vn` (never exposed to browser) |
| `VBI_CANCEL_API_KEY` | API key for the VBI cancellation endpoint |
| `CANCEL_ALLOWED_EMAILS` | Comma-separated emails allowed to use the cancel feature (server-side) |
| `NEXT_PUBLIC_CANCEL_ALLOWED_EMAILS` | Same list, exposed to browser for UI gating |
| `MOTHERDUCK_TOKEN` | MotherDuck (DuckDB cloud) access token |
| `NEXT_PUBLIC_APP_URL` | Public base URL of the app (e.g. `https://your-site.netlify.app`) |

## Deployment (Netlify)

All env vars above must be set in Netlify → Site Settings → Environment Variables. The `netlify.toml` and `@netlify/plugin-nextjs` handle the build automatically.

**Native module bundling**: `netlify.toml` sets `node_bundler = "nft"`, `external_node_modules`, and `included_files` for `@duckdb`. This is required — without it, `libduckdb.so` is missing at runtime and the payment-history function crashes with `cannot open shared object file`.

## Next.js 16 migration notes

These breaking changes were applied when upgrading from Next.js 14 → 16:

- **`cookies()` is async**: every call must be `await cookies()` — applies to all route handlers and server components.
- **`serverComponentsExternalPackages`** moved out of `experimental` to top-level `serverExternalPackages`.
- **`middleware.ts`** renamed to `proxy.ts`; the exported function must be named `proxy` (not `middleware`) with a named `config` export for the matcher.
- **`@netlify/blobs` v8** removed CAS options (`onlyIfMatch`, `onlyIfNew`) from `setJSON`; `setJSON` now returns `void`.
