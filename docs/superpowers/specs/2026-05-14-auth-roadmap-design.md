# Authentication & Authorization Roadmap

**Status:** Design — pending user review
**Date:** 2026-05-14
**Scope:** A multi-phase roadmap to take the trading journal from its current hand-rolled JWT auth to a production-grade Auth.js-based system ready for public signups within 6–12 months.

## Goals

1. Make public signup safe to enable. No `localStorage` token theft surface, no hardcoded fallback secrets, no unbounded login attempts.
2. Stop owning auth code beyond what's necessary. Delegate OAuth, magic links, CSRF, cookie handling to a maintained library.
3. Centralize authorization so every data read goes through one `userScope()` helper. No route can accidentally leak another user's data.
4. Reserve hooks for MFA and audit logging so they become additive features later, not rewrites.
5. Add an admin role for operator support tasks (suspend a user, run a query) without building an admin UI yet.

## Non-goals

- **MFA (TOTP/WebAuthn).** Schema reserved, no implementation in this roadmap.
- **Audit log table.** Comment markers in Auth.js callbacks, no table yet.
- **Admin UI.** Just the role + route guard. Operator tasks happen via SQL.
- **Multi-tenant / teams.** Strict single-user data ownership.
- **Public/shareable trade links.** Out of scope.
- **Soft delete.** Account deletion is hard delete with cascade.

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Auth library | Auth.js v5 + `@auth/prisma-adapter` | Open-source, lives in repo, keeps Prisma User table, no SaaS lock-in |
| Session strategy | Database sessions | Enables server-side revoke, multi-device listing, MFA challenge state |
| Token transport | HttpOnly + SameSite=Lax + Secure cookies | Closes the localStorage/XSS hole |
| Server topology | Collapse Express into Next.js Route Handlers | One server, one auth flow, no token-plumbing between services |
| Email provider | Resend | Free tier (3k/mo, 100/day), simple Auth.js Email-provider integration |
| OAuth providers at launch | Google + GitHub | Trader-friendly, both already supported by Auth.js |
| Magic links | Yes, via Auth.js Email provider | Doubles as soft password recovery |
| Authorization model | Single-user ownership + admin role | Matches schema; admin role is one column + one guard |
| Account deletion | Hard delete with cascade | Matches existing `onDelete: Cascade` |
| Existing user migration | Preserve UUIDs, reuse `passwordHash` via Credentials provider | Keeps every FK relationship intact |

## Architecture

### Server topology

Today: `apps/web` (Next.js, port 3000) calls `apps/api` (Express, port 4000) via Next.js rewrites with a Bearer JWT.

After this roadmap: `apps/web` only. All API routes live in `apps/web/src/app/api/.../route.ts`. Express service deleted from Render. Shared business logic (Prisma queries, validators, csvParser, calculations, broker adapters) moves to `apps/web/src/server/`.

Frontend `apiFetch()` helper drops the cross-origin URL — all calls become same-origin relative paths. No more Bearer header; the session cookie is sent automatically by the browser.

### Auth.js configuration

- **Adapter:** `PrismaAdapter(prisma)`.
- **Session strategy:** `"database"`.
- **Cookies:** HttpOnly, SameSite=Lax, Secure in production.
- **Providers (in order shown on signin page):**
  1. Google OAuth (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`)
  2. GitHub OAuth (`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`)
  3. Email (magic link, via Resend — `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM`)
  4. Credentials (email + password, validates against existing `User.passwordHash`)
- **Secret:** `AUTH_SECRET` (consolidates today's `JWT_SECRET` / `NEXTAUTH_SECRET` mismatch).
- **Callbacks:** `signIn` callback validates email verification status for Credentials provider; comment marker for future MFA challenge. `events.signIn` / `events.signOut` / `events.createUser` / `events.updateUser` all have comment markers for future audit-log emit calls.

### Authorization helpers

Two helpers live in `apps/web/src/server/auth/guard.ts`:

```ts
// Throws 401 (NextResponse) if no session. Returns { id, role, email }.
export async function requireUser(): Promise<SessionUser>;

// Throws 403 if user is not ADMIN. Returns the user.
export async function requireAdmin(): Promise<SessionUser>;
```

A `userScope(userId)` helper lives in `apps/web/src/server/db/scope.ts` and returns Prisma where-clauses pre-scoped to the user. Every route handler must call `requireUser()` and pass the resulting id into `userScope()` (or `requireAdmin()` for admin-only routes). Enforcement: a vitest-based static check (`apps/web/src/server/db/scope.spec.ts`) that greps `apps/web/src/app/api/**/route.ts` for raw `prisma.<model>.findMany|findFirst|update|delete` calls and fails if any appears without an adjacent `userScope(` or `requireAdmin(` reference. Not bulletproof but cheap and catches the obvious mistakes.

### MFA hooks (reserved, not implemented)

`User` schema additions:
- `mfaEnabled: Boolean @default(false)`
- `totpSecret: String?` (encrypted at rest when implemented)
- `mfaBackupCodes: String[] @default([])`

Auth.js `signIn` callback has a placeholder: if `user.mfaEnabled && credentialsProvider`, redirect to `/auth/mfa-challenge`. The challenge page does not exist yet — the callback short-circuits and lets login through. Flipping the feature on later is one branch change.

### Audit log hooks (reserved, no table yet)

The `events.*` callbacks in the Auth.js config each have a `// TODO(audit): emit { type, userId, ip, userAgent }` comment. When we ship the audit log, we'll add an `AuthEvent` table and replace the TODOs with insert calls. No table or migration in this roadmap.

## Schema changes

### Renames

- `Account` (trading account) → **`TradingAccount`** (table: `trading_accounts`).
  - Reason: Auth.js's Prisma adapter requires a model named `Account` for OAuth provider linkage. Naming conflict.
  - All FKs cascade. Touches: `Trade.accountId` → `Trade.tradingAccountId`, all references in `apps/web/src/components/`, `apps/web/src/server/`, etc.
  - Migration includes a `RENAME TABLE` + column rename so existing data is preserved.

### Additions

- `User.role: Role` enum (`USER | ADMIN`), default `USER`.
- `User.emailVerified: DateTime?` (Auth.js standard).
- `User.image: String?` (Auth.js standard — from OAuth provider).
- `User.mfaEnabled: Boolean @default(false)`.
- `User.totpSecret: String?`.
- `User.mfaBackupCodes: String[] @default([])`.

### New tables (per `@auth/prisma-adapter` spec)

- `Account` — OAuth provider linkage (provider, providerAccountId, tokens, etc.). Cascade-delete on User.
- `Session` — one row per active session. Cascade-delete on User.
- `VerificationToken` — single-use tokens for magic links + email verification.

### Removals

- The hand-rolled `/auth/login`, `/auth/register`, `/auth/me` routes go away in Phase 2 (replaced by Auth.js endpoints).
- The `passwordHash` column stays — it's reused by the Credentials provider.

## Phased rollout

### Phase 0: Pre-work (independent ship)

Small fixes that improve safety today without depending on the larger migration. Can ship as one PR.

1. Consolidate `JWT_SECRET` and `NEXTAUTH_SECRET` env vars into a single `AUTH_SECRET`. Update `render.yaml` and `.env.example`.
2. Remove the hardcoded `'fallback-dev-secret'` in `apps/api/src/middleware/auth.ts`. Fail-fast on boot if `AUTH_SECRET` is unset.
3. Add `express-rate-limit` to `/auth/login` and `/auth/register`: 5 attempts per 15 minutes per IP. Login by email also rate-limited per-email (5 / 15 min) to make enumeration slower.

**Done when:** secret rotation works locally and on Render; rate limiter returns 429 on a 6th attempt; tests pass.

### Phase 1: API consolidation

Move every Express route into Next.js Route Handlers. Auth stays as-is (Bearer JWT in localStorage). Pure mechanical migration. After this phase, `apps/api` is deleted.

1. Create `apps/web/src/server/` and move shared logic into it:
   - `lib/calculations.ts` → `server/lib/calculations.ts`
   - `lib/analytics-helpers.ts` → `server/lib/analytics-helpers.ts`
   - `lib/validators.ts` → `server/lib/validators.ts`
   - `lib/csvParser.ts` → `server/lib/csvParser.ts`
   - `lib/brokerAdapters/` → `server/lib/brokerAdapters/`
2. For each Express route file, create a parallel Route Handler in `apps/web/src/app/api/...`. The legacy JWT auth flow (login/register/me) keeps working unchanged through these handlers — they sign the same `AUTH_SECRET`-signed JWT, set `req.userId` via the legacy helper. They get deleted in Phase 2.
   - `/auth/*` → `apps/web/src/app/api/auth-legacy/[...path]/route.ts` (note the `auth-legacy` prefix to avoid collision with `app/api/auth/[...nextauth]` in Phase 2)
   - `/trades` → `apps/web/src/app/api/trades/route.ts` + `[id]/route.ts`
   - `/dashboard` → `apps/web/src/app/api/dashboard/route.ts`
   - `/analytics` → `apps/web/src/app/api/analytics/route.ts`
   - `/tags` → `apps/web/src/app/api/tags/route.ts` + `[id]/route.ts`
   - `/journal` → `apps/web/src/app/api/journal/route.ts` + `[id]/route.ts`
   - `/settings` → `apps/web/src/app/api/settings/route.ts`
   - `/accounts` → `apps/web/src/app/api/accounts/route.ts` + `[id]/route.ts`
3. Port the JWT middleware into a Next.js helper: `apps/web/src/server/auth/legacy-jwt.ts` exporting `getUserIdFromRequest(req)`. Every Route Handler calls it.
4. Update `apiFetch()` to drop the Next.js rewrite — calls are now same-origin to `/api/...`.
5. Remove the Next.js rewrite for `/api/:path*` → `http://localhost:4000/:path*` from `apps/web/next.config.*`.
6. Delete `apps/api` and remove its workspace from `package.json`. Remove its service from `render.yaml`.
7. Update `npm run dev` so `apps/web` is the only dev process.

**Done when:** all existing integration tests pass against Next.js routes; deployed Render service serves API + web from one origin; `apps/api` directory deleted; nothing depends on port 4000.

### Phase 2: Auth.js cutover

The auth swap. After this phase, JWT/localStorage is gone, replaced by Auth.js database sessions and cookies.

1. Install `next-auth@5`, `@auth/prisma-adapter`, `resend`.
2. Rename `Account` → `TradingAccount`:
   - Prisma migration: rename table, rename column on `Trade`.
   - Codebase refactor across `apps/web/src/server/`, `apps/web/src/components/`, `apps/web/src/app/`, all tests.
3. Add Auth.js schema (`Account`, `Session`, `VerificationToken`) + new `User` columns (`role`, `emailVerified`, `image`, `mfaEnabled`, `totpSecret`, `mfaBackupCodes`). Single migration.
4. Configure Auth.js at `apps/web/src/server/auth/config.ts` and export `auth`, `signIn`, `signOut`, `handlers` from `apps/web/src/server/auth/index.ts`.
5. Wire the Auth.js route handler at `apps/web/src/app/api/auth/[...nextauth]/route.ts` (replaces the legacy `/auth/*` from Phase 1).
6. Replace `getUserIdFromRequest()` calls in every Route Handler with `await requireUser()`. Delete `legacy-jwt.ts`.
7. Update signin / signup pages to use Auth.js (`signIn("credentials", ...)`, `signIn("google")`, `signIn("github")`, `signIn("resend", { email })`).
8. Delete `apps/web/src/components/auth/...` localStorage token handling. The `apiFetch()` helper drops its Bearer header logic.
9. Existing user impact: one-time forced sign-out (existing JWTs ignored). Add a banner on the signin page explaining the change.
10. Backfill existing users as email-verified: a one-time data migration sets `User.emailVerified = NOW()` for all rows that exist at cutover time. Rationale: pre-Auth.js users registered before the verification flow existed; treating them as unverified would lock them out of their own data on first signin.

**Done when:** Google + GitHub OAuth round-trips work in staging; magic link email arrives via Resend; password sign-in works for an existing user; session cookie is HttpOnly+Secure+SameSite=Lax in DevTools; logging out invalidates the session row in DB.

### Phase 3: Account flows

User-facing flows that turn this into a real product.

1. **Email verification.** New users created via Credentials provider get an unverified state. `requireUser()` returns the user even if unverified; a separate `requireVerifiedUser()` is used by routes that mutate data (trades, journal, etc.). Unverified users see a banner with a "resend verification email" link. OAuth and magic-link signins auto-verify.
2. **Password reset.** Use Auth.js's Email provider with a custom email template that links to `/auth/reset-password?token=...`. The token verifies via `VerificationToken`, lets the user set a new `passwordHash`.
3. **Account deletion.** `DELETE /api/account` route. Calls `requireUser()`, runs `prisma.user.delete({ where: { id } })` — cascade handles the rest. Confirmation modal on the frontend with the user typing their email to confirm.
4. **Session listing + revoke.** `GET /api/account/sessions` lists `Session` rows for the user (deviceish info from `userAgent`). `DELETE /api/account/sessions/:id` revokes one. `DELETE /api/account/sessions` revokes all-but-current ("log out all other devices").

**Done when:** end-to-end signup flow includes a verification email; forgotten-password flow works; deleting an account removes all owned data; session revoke immediately invalidates the cookie on the next request.

### Phase 4: Admin guardrails

1. Add `role: Role` enum to `User` (migration). Default `USER`.
2. Implement `requireAdmin()` helper. Throws 403 for non-admin sessions.
3. Add a one-shot SQL/script to promote a user: `UPDATE users SET role = 'ADMIN' WHERE email = ?`. Document in README.
4. No admin UI built. The role is purely for guarding future operator routes.

**Done when:** flipping a user to `ADMIN` in DB and visiting an admin-guarded route returns 200; same route returns 403 for a `USER`.

### Future work (not in this roadmap)

These are flagged so the design accommodates them, but they're separate efforts:

- **TOTP MFA.** Schema reserved. Implementation involves: an enrollment flow (show QR code, store encrypted secret + 8 backup codes), the `signIn` callback redirecting to `/auth/mfa-challenge`, the challenge page accepting a 6-digit code or a backup code.
- **Audit log table.** Add `AuthEvent` model and replace the `// TODO(audit)` markers with insert calls. Surface log to admin role only.
- **Admin UI.** A `/admin` route group with user listing, suspend/unsuspend, basic usage stats.
- **Public/shareable trade links.** Adds a `visibility` column + share-token table + rate-limit-by-IP on public reads.

## Testing strategy

- **Unit tests** on `userScope()`, `requireUser()`, `requireAdmin()` — verify they throw correctly and return correct types.
- **Integration tests** for each auth flow against a test database:
  - Signup with Credentials → email verification → first login
  - OAuth provider flow (mocked provider)
  - Password reset (request → email token → new password → login)
  - Magic link signin (request → token → session)
  - Account deletion cascades through Trade, TradingAccount, Tag, JournalEntry, UserSettings
  - Admin route returns 403 for `USER`, 200 for `ADMIN`
  - Session revoke invalidates the cookie on the next request
- **E2E (Playwright)** for the critical "signup → first trade entry" flow against a staging environment with real Resend.
- **Manual** sanity passes for: Google sign-in with a real Google account in staging; GitHub sign-in with a real GitHub account in staging; magic link arriving in a real inbox.

## Risks

- **Phase 1 surface area.** Largest mechanical migration. Mitigation: no behavior changes; existing tests verify equivalence. Per-route PRs are an option if the single PR is too large to review.
- **`Account` rename.** Touches dozens of files. Mitigation: one focused commit, search-replace based, with the Prisma migration in the same commit so it's atomic.
- **Existing user logout at Phase 2 cutover.** Acceptable — at present the user base is just the operator.
- **Render free plan.** Two services become one — this actually helps. No new cost.
- **Resend free tier limits.** 3k emails/month, 100/day. Sufficient for launch. Monitor `events.signIn` count once public.
- **`signIn` callback complexity.** MFA placeholder + email-verified gate + audit-emit markers all live here. Mitigation: keep the callback small; extract each concern into its own helper function.
- **OAuth provider account linking.** Auth.js does not auto-link an OAuth provider to an existing email account by default (this prevents an attacker who created a Google account with someone else's email from hijacking that account). Decision: **do not** set `allowDangerousEmailAccountLinking: true` on any provider. Instead, in Phase 3, add an explicit "Connected accounts" settings page where a logged-in user can link Google/GitHub to their existing account. Users signing in with OAuth for the first time on an email that already exists get an error telling them to sign in with their password first, then link from settings.

## Open questions

None blocking. Items deferred to implementation-plan stage:

- Exact Auth.js cookie names and `cookies` config block (defaults are fine; only customize if there's a specific reason).
- Resend template HTML (use Auth.js defaults initially, polish in Phase 3).
- Whether to add `helmet` middleware to Next.js — likely yes, decide when implementing.
