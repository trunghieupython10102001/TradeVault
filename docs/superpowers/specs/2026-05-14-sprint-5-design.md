# Sprint 5 Design

**Status:** Design — pending user review
**Date:** 2026-05-14
**Scope:** Four independent features bundled into one sprint, matching the cadence of Sprints 1–4: Playbook/Strategy Templates (P3-F9), New-User Onboarding (P3-U8), Monte Carlo Simulation (P3-D5), and a starter Test Suite + CI (P3-T5).

## Goals

1. Reduce the "blank page" problem in the trade form by letting traders save reusable setups per strategy.
2. Convert a brand-new signup into someone with one trade and one journal entry within their first session.
3. Add forward-looking risk analysis — what could the next 100 trades look like, given trade history?
4. Land a starter test suite + CI so future work has guardrails. The auth roadmap's tests already cover guards, scope, and email; this sprint covers route handlers, forms, and an end-to-end smoke.

## Non-goals

- No "share a playbook" / marketplace features. Strictly per-user.
- No video tutorials or onboarding analytics tracking — just the wizard + empty states + checklist.
- No client-side Monte Carlo for "live" tweaking — single backend call per parameter change.
- No coverage % target. Tests are pragmatic.
- No Storybook / visual regression. RTL only for the trade form.

## Locked decisions

| Decision | Choice | Why |
|---|---|---|
| Playbook scope | Per (user, strategy) with title, setup text, optional checklist | Matches how traders use playbooks; checklist supports pre-trade routines |
| Playbook trade-form integration | Explicit "Load from playbook" button | Auto-fill is too magic — risks stomping user input on accident |
| Onboarding trigger | New `User.onboardedAt: DateTime?` column | Cleaner than inferring from data |
| Onboarding steps | Capital → first account → strategies (3 steps, skippable) | Maps to existing settings; quick to complete |
| Empty-state CTAs | Dashboard, Trades, Journal | Three pages a new user lands on |
| Getting-started card | Dashboard only, dismissible, auto-hides on completion | One surface — avoids notification fatigue |
| Monte Carlo location | New page `/dashboard/analytics/monte-carlo` | Distinct enough from per-trade analytics to deserve its own page |
| Monte Carlo input | R-multiple where available, else P&L% | R-multiple is theoretically correct (already normalized) |
| Monte Carlo N / K | N=1000 simulations × K=100 future trades | Standard for retail-trading bootstrap; fast enough to compute on every request |
| Monte Carlo caching | None — compute on demand | Trivially cheap (~50ms) and inputs change with filters |
| Test framework | vitest (already in use) + RTL + Playwright | Minimum surface; vitest is already wired |
| CI | GitHub Actions on PR | Standard; nothing exotic |

## Feature 1: Playbook

### Schema
Add to `packages/database/prisma/schema.prisma`:

```prisma
model Playbook {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  strategy  String
  title     String
  setup     String   @db.Text
  checklist String[] @default([])
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, strategy])
  @@map("playbooks")
}
```

Add `playbooks Playbook[]` to the `User` model.

`@@unique([userId, strategy])` enforces one playbook per strategy per user — matches the "default setup for this strategy" semantic.

### API

- `GET /api/playbooks` — list this user's playbooks.
- `GET /api/playbooks/:strategy` — get one (404 if missing). `:strategy` is URL-encoded.
- `POST /api/playbooks` — create or upsert (since strategy is unique-per-user, POST upserts).
- `DELETE /api/playbooks/:strategy` — remove.

All routes use `withVerifiedAuth` (mutating) or `withAuth` (read-only) from the auth roadmap.

### UI

- `/dashboard/settings/playbook` — full CRUD page. List existing playbooks, "Add playbook" form: strategy dropdown (from `UserSettings.strategies`), title, setup textarea, dynamic checklist editor (add/remove rows). Strategies without an existing playbook are eligible in the dropdown.
- Trade form (`/dashboard/trades/new` and `/dashboard/trades/[id]/edit`): a "Load from playbook" button appears next to the strategy field. Only enabled when a strategy is selected AND that strategy has a playbook. Clicking opens a confirm dialog ("Load setup from playbook? Existing setup description will be replaced.") and on confirm, fills the setup-description and adds checklist items as a structured block at the top of the setup field.

### Edge cases
- If the user's strategy list (`UserSettings.strategies`) doesn't include the playbook's strategy (e.g., they renamed strategies), the playbook stays in the DB but doesn't surface in the trade form. Settings page can still see/delete it.
- Empty setup is allowed (a playbook can be checklist-only). Empty checklist is allowed too.

## Feature 2: Onboarding

### Schema
Add to `User` model:

```prisma
onboardedAt DateTime? @map("onboarded_at")
```

Migration sets `onboardedAt = NOW()` for all existing users — they don't need to see the wizard.

### Flow

1. User signs up (existing flow). On first dashboard visit, server component checks `session.user.id`'s `onboardedAt`. If null, redirect to `/onboarding`.
2. `/onboarding` page renders a three-step wizard:
   - **Step 1: Starting capital.** Single number input, defaults to 10000. Saves to `UserSettings.startingCapital`.
   - **Step 2: First trading account.** Name (required), broker (optional dropdown of common brokers + "Other"), initial balance (defaults to Step 1's capital), currency. Creates or updates the user's first `TradingAccount` (the default one already exists from signup — we update it).
   - **Step 3: Strategies.** Multi-select from common defaults (Breakout, Scalping, Swing, News, Mean Reversion) + free-text add. Saves to `UserSettings.strategies`.
3. "Finish" → `POST /api/onboarding/complete` sets `onboardedAt = NOW()` → redirects to `/dashboard`.
4. "Skip for now" available on every step → same POST → redirect to dashboard. (Wizard data already entered up to skip point is saved; user can re-complete from settings.)

### API
- `POST /api/onboarding/complete` — sets `onboardedAt = NOW()`. Idempotent.

The wizard steps reuse the existing `/api/settings` PATCH and `/api/accounts/:id` PATCH endpoints — no new APIs for the per-step saves.

### Empty-state CTAs
Three pages get empty states when the relevant data is missing:
- **Dashboard:** when no trades exist — illustration + "Log your first trade" button → `/dashboard/trades/new`.
- **Trades list:** when no trades exist — same empty state.
- **Journal:** when no entries exist — illustration + "Write your first journal entry" that opens the existing inline create form on `/dashboard/journal` (no separate `/new` route — journal uses an inline form on the index page).

A shared `<EmptyState>` component lives in `apps/web/src/components/EmptyState.tsx`.

### Getting-started checklist card
On `/dashboard`, render a `<GettingStartedCard>` above the metric grid when:
- `session.user.onboardedAt` is recent (within 7 days), OR
- not all four checklist items are complete (when `onboardedAt` is older, the card auto-hides once complete OR after one dismissal).

Items (each is a Prisma count query, run in the same server component):
1. ✓ Onboarding complete (`onboardedAt` not null)
2. ✓ First trade logged (`prisma.trade.count({ where: { userId } }) > 0`)
3. ✓ First journal entry (`prisma.journalEntry.count({ where: { userId } }) > 0`)
4. ✓ First tag created (`prisma.tag.count({ where: { userId } }) > 0`)

Each unchecked item shows a CTA link. A "Dismiss" button on the card sets a `localStorage` flag — server doesn't store dismissal state (it's a per-device hint, not a permanent preference).

## Feature 3: Monte Carlo Simulation

### Backend
Pure function in `apps/web/src/server/lib/monte-carlo.ts`:

```ts
export type MonteCarloInput = {
  /** R-multiples or P&L% values for historical closed trades. */
  returns: number[];
  /** Number of simulated paths. */
  simulations: number;
  /** Trades per simulated path. */
  pathLength: number;
  /** Starting equity for the simulated curve. */
  startingEquity: number;
};

export type MonteCarloResult = {
  percentiles: { p5: number[]; p50: number[]; p95: number[] }; // each array length = pathLength + 1
  endingBalances: number[]; // length = simulations, sorted ascending
  finalP5: number;
  finalP50: number;
  finalP95: number;
  riskOfRuin: number; // fraction of simulations where equity hit <= 0
  maxDrawdownP50: number; // median max drawdown across simulations
  maxDrawdownP95: number; // 95th-percentile worst max drawdown
};

export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult;
```

The function:
1. For each of `simulations` paths, draws `pathLength` samples *with replacement* from `returns`.
2. For R-multiple paths, assumes a fixed % risk per trade (taken from `UserSettings.riskPerTrade`, defaulting to 1%). Equity update per trade: `equity *= (1 + (r * riskPct))`.
3. For P&L% paths, equity update: `equity *= (1 + pnlPct/100)`.
4. Computes per-step percentiles across simulations for the fan chart.
5. Computes per-simulation max drawdown.
6. Counts how many simulations hit `equity <= 0` (ruin).

This function is the only piece with non-trivial logic; it lives in a pure file so it's easily unit-tested.

### API
- `POST /api/analytics/monte-carlo` — body: `{ simulations?: 1000, pathLength?: 100, accountId?: string, strategy?: string, from?: string, to?: string }`. Returns `MonteCarloResult` plus `{ inputSampleSize: number, returnType: 'R' | 'PCT' }` for transparency. Uses `withAuth`.

The route:
1. Loads closed trades for `auth.user.id` with optional filters via `userScope`.
2. Decides `returnType` automatically (not a request parameter): if **every** loaded trade has a non-null `rMultiple`, use `'R'`; otherwise fall back to `'PCT'` and skip any trades without a non-null `pnlPercent`. No mixing within a single call.
3. Builds the `returns` array from `rMultiple` (R mode) or `pnlPercent` (PCT mode).
4. Returns 400 with `{ error: 'Not enough trades', count: returns.length }` if `returns.length < 20`.
5. Calls `runMonteCarlo` and returns the result + the chosen `returnType` so the UI can label axes ("R" vs "%").

### UI
- `/dashboard/analytics/monte-carlo` page. Header with "Monte Carlo Simulation" + a brief explanation. Sidebar/top: filter controls (account, strategy, date range, optional `simulations` / `pathLength` sliders). Main panel:
  - **Equity-curve fan chart** (Recharts AreaChart with three series: p5, p50, p95).
  - **Ending-balance distribution histogram** below the fan chart.
  - **Key metrics row**: P5 / P50 / P95 final balance, Risk of ruin %, Median max drawdown %, 95th-percentile drawdown %.
  - Sample-size warning if fewer than 50 trades ("Results are noisy below 50 trades").
- Empty state if user has < 20 closed trades — "Log at least 20 closed trades to run Monte Carlo. You currently have N."

### Add to nav
"Monte Carlo" link under the existing Analytics nav item (or as a sub-item if the sidebar supports it).

## Feature 4: Test Suite + CI

### Test scope (just this sprint)

**Backend route integration tests** (vitest, in-repo) using mocked `auth()`:
- `apps/web/src/app/api/trades/route.test.ts` — covered partly by Phase 1; this sprint extends it to cover all filter combinations and the per-user scoping invariant.
- `apps/web/src/app/api/journal/route.test.ts` — CRUD + the unique-per-day constraint.
- `apps/web/src/app/api/analytics/route.test.ts` — basic shape + correctness against fixture trades.
- `apps/web/src/app/api/playbooks/route.test.ts` — new for this sprint.
- `apps/web/src/app/api/analytics/monte-carlo/route.test.ts` — covers the 400 cases (not enough data) and a happy path.

**Pure function unit tests** (vitest):
- `apps/web/src/server/lib/monte-carlo.test.ts` — runs against a fixed-seed deterministic input. Asserts percentile ordering, sample-size handling, ruin counting on a curated set of losing trades.

**Component tests** (RTL):
- `apps/web/src/components/trades/TradeForm.test.tsx` — required field validation, auto-calc P&L, "Load from playbook" button enable/disable based on strategy selection.

**End-to-end smoke** (Playwright):
- `apps/web/e2e/smoke.spec.ts` — log in (Credentials, dev seed) → navigate to /dashboard/trades/new → fill required fields → submit → assert trade appears on /dashboard/trades and on /dashboard.

### Setup

Add to `apps/web/package.json` devDependencies:
- `@testing-library/react`
- `@testing-library/jest-dom`
- `@testing-library/user-event`
- `jsdom` (vitest environment for RTL)
- `@playwright/test`

Add to `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
```

Create `apps/web/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Create `apps/web/playwright.config.ts` with a single project, base URL `http://localhost:3000`, retries=0 in CI for fast feedback.

### CI

Add `.github/workflows/test.yml`:

```yaml
name: test
on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: trading_journal_test
        ports: [5432:5432]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20.20.1, cache: npm }
      - run: npm ci
      - run: npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/trading_journal_test
      - run: npm run lint
      - run: npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/trading_journal_test
          AUTH_SECRET: ci-secret-not-real
      - run: npx playwright install --with-deps chromium
      - run: npm run build --workspace=trading-journal
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/trading_journal_test
          AUTH_SECRET: ci-secret-not-real
      - run: npx playwright test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/trading_journal_test
          AUTH_SECRET: ci-secret-not-real
```

### What's deliberately not tested in this sprint

- Component tests for any page other than `TradeForm`. Adding them is cheap; we just don't gate Sprint 5 on it.
- Visual regression. Not worth the setup cost yet.
- Auth flows (Auth.js sign-in flows in Playwright). The Phase 2 auth plan adds those integration tests at the route layer; an end-to-end OAuth click-through in CI is too fragile.

## Phasing within the sprint

The four features are independent and can be tackled in any order, but for a clean PR cadence:

1. **Test suite scaffolding first** (vitest jsdom, RTL setup, GitHub Actions workflow). One PR. Doesn't add new tests; just adds the harness. Means subsequent features land with CI already on.
2. **Playbook**. Schema → API → settings page → trade-form button. One PR.
3. **Monte Carlo**. Pure function + tests → API → page → nav link. One PR.
4. **Onboarding**. Schema column + migration → API → wizard pages → empty states → checklist card. One PR.
5. **Final test pass**: add the integration tests, RTL tests, and Playwright smoke that this sprint's features warranted. One PR.

## Risks

- **Monte Carlo R vs P&L% mixing.** The spec says "no mixed paths" — return type is decided at the route level, not per-trade. This is deliberately conservative. If users complain about ignored trades, revisit.
- **Onboarding wizard mid-step abandonment.** A user filling in capital then closing the tab leaves partial state in `UserSettings` but `onboardedAt` is still null. Next visit they'll see the wizard again, and Step 1 will be pre-filled. That's the intended behavior — no data loss, just resumption.
- **Playbook uniqueness conflict with strategy renaming.** If a user renames a strategy in settings, their playbook for the old strategy name becomes orphaned. Settings page surfaces orphaned playbooks at the bottom with "Strategy no longer exists — delete?".
- **CI cost.** Playwright in CI pulls Chromium (~150MB). One workflow run takes 2–4 min on free tier. Acceptable.

## Open questions

None blocking. The following are explicitly deferred:

- Whether to share playbooks between users (deferred — needs a separate spec covering privacy/visibility).
- Monte Carlo with position-size variation (currently fixed risk per trade — could let users vary it).
- Onboarding completion analytics (we're not tracking funnel — too early).
- Mutation testing or fuzz testing for Monte Carlo (overkill for this sprint).
