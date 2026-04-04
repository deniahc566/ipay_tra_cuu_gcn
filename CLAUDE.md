# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Internal tool for VBI Customer Support to look up insurance certificates (GCN) via the iPay channel. Built with Next.js 14 App Router.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build + type check
npm run lint     # ESLint

# Generate a secret for JWT_SECRET or SESSION_PASSWORD:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Local setup

Copy `.env.example` to `.env.local` and fill in all values before running `npm run dev`. In development, OTPs are logged to the server console instead of being emailed (see `src/lib/resend.ts`).

## Architecture

**Auth flow (stateless OTP — no database):**
1. `POST /api/auth/request-otp` — validates email domain, signs a 10-min JWT `{email, otp}`, sets it as an `httpOnly` cookie `otp_token`, sends the 6-digit OTP via Resend.
2. `POST /api/auth/verify-otp` — reads `otp_token` cookie, verifies JWT, compares OTP with `timingSafeEqual`, creates an `iron-session` cookie (`ipay_session`), clears `otp_token`.
3. Protected pages call `getIronSession(cookies(), sessionOptions)` and `redirect('/login')` if no session.

**VBI API proxy (`src/lib/vbi-api.ts`):**
The upstream endpoint expects `P_OBJ_INPUT` as a Python-style single-quote dict string — use the template literal already in `vbiApiLookup`, not `JSON.stringify`. Inputs are sanitized with `.replace(/'/g, '')` before interpolation.

**Key files:**
- `src/lib/session.ts` — iron-session config and `SessionData` type
- `src/lib/otp-jwt.ts` — `signOtpToken` / `verifyOtpToken` using `jose` HS256
- `src/lib/vbi-api.ts` — `vbiApiLookup` wraps the VBI external API
- `src/lib/resend.ts` — `sendOtpEmail` (no-ops in development)
- `src/components/search/SearchForm.tsx` — main search UI with results state machine
- `src/app/api/insurance/lookup/route.ts` — auth-guarded proxy to VBI

## Environment variables

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs OTP JWTs (32+ chars) |
| `SESSION_PASSWORD` | Encrypts iron-session cookie (32+ chars, different from JWT_SECRET) |
| `ALLOWED_EMAIL_DOMAIN` | Only emails from this domain can log in (e.g. `vbi.com.vn`) |
| `RESEND_API_KEY` | Resend API key for sending OTP emails |
| `EMAIL_FROM` | Verified sender address in Resend |
| `VBI_API_KEY` | API key for `openapi.evbi.vn` (never exposed to browser) |

## Deployment (Netlify)

All env vars above must be set in Netlify → Site Settings → Environment Variables. The `netlify.toml` and `@netlify/plugin-nextjs` handle the build automatically.
