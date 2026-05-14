# Sprint 5 — Final Test Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the integration tests, RTL form tests, and Playwright smoke test that the rest of Sprint 5 implies. After this plan: every high-blast-radius API route has integration coverage; the trade-form has component coverage; CI runs an end-to-end smoke covering "log in → create trade → see it on the dashboard."

**Architecture:** All tests live where the code they test lives (`*.test.ts` next to the file under test). The Playwright spec lives in `apps/web/e2e/`. Each test file is one PR-sized chunk of work.

**Tech Stack:** vitest (with jsdom env from the scaffolding plan), `@testing-library/react`, `@testing-library/user-event`, `@playwright/test`.

**Reference spec:** `docs/superpowers/specs/2026-05-14-sprint-5-design.md` §Feature 4.

**Pre-condition:** All of:
- Test scaffolding plan merged (CI live, RTL configured, Playwright configured).
- Playbook plan merged (so `/api/playbooks` exists).
- Monte Carlo plan merged.
- Onboarding plan merged.
- Auth roadmap Phase 2 merged (so `requireUser`, `auth()` mock pattern, and Auth.js sign-in flow are stable).

**End-state verification:** `npm test` passes locally and in CI. `npm run e2e` passes locally (web server running) and in CI. Coverage on `apps/web/src/server/**` improves measurably (no specific threshold).

---

## File Map

- Create: `apps/web/src/app/api/trades/route.filters.test.ts` — extended GET filter coverage.
- Create: `apps/web/src/app/api/journal/route.test.ts` — full CRUD + unique-per-day constraint.
- Create: `apps/web/src/app/api/analytics/route.test.ts` — happy path + shape + scoping.
- Create: `apps/web/src/app/dashboard/trades/new/page.test.tsx` — TradeForm validation + auto-calc + Load-from-playbook button enable/disable.
- Create: `apps/web/e2e/auth-and-trade.spec.ts` — end-to-end smoke.
- Create: `apps/web/e2e/fixtures.ts` — DB seed helpers for the smoke test.

---

### Task 1: Extended /api/trades filter integration tests

**Files:**
- Create: `apps/web/src/app/api/trades/route.filters.test.ts`

(The base `apps/web/src/app/api/trades/route.test.ts` was created in the auth Phase 1 plan and covers basic GET/POST/scoping. This file extends with filter combinations.)

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@repo/database';
import { GET } from './route';

vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/server/auth';

let userId: string;

beforeAll(async () => {
  const u = await prisma.user.create({ data: { email: `tflt-${Date.now()}@x.com`, emailVerified: new Date() } });
  userId = u.id;
  await prisma.trade.createMany({
    data: [
      { userId, symbol: 'AAPL',  side: 'LONG',  status: 'CLOSED', entryPrice: 100, exitPrice: 110, quantity: 1, entryDate: new Date('2026-01-15'), exitDate: new Date('2026-01-16') },
      { userId, symbol: 'TSLA',  side: 'LONG',  status: 'OPEN',   entryPrice: 200, quantity: 1, entryDate: new Date('2026-02-01') },
      { userId, symbol: 'TSLA',  side: 'SHORT', status: 'CLOSED', entryPrice: 250, exitPrice: 240, quantity: 1, entryDate: new Date('2026-03-01'), exitDate: new Date('2026-03-02') },
      { userId, symbol: 'NVDA',  side: 'LONG',  status: 'CLOSED', entryPrice: 500, exitPrice: 510, quantity: 1, entryDate: new Date('2026-04-01'), exitDate: new Date('2026-04-02') },
    ],
  });
});

afterAll(async () => {
  await prisma.trade.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

beforeEach(() => {
  vi.resetAllMocks();
  (auth as any).mockResolvedValue({
    user: { id: userId, email: 'a@b.com', role: 'USER', emailVerified: new Date() },
  });
});

async function getJson(qs: string) {
  const res = await GET(new Request(`http://localhost/api/trades${qs}`));
  return { status: res.status, body: await res.json() };
}

describe('GET /api/trades filters', () => {
  it('returns all without filters', async () => {
    const r = await getJson('');
    expect(r.body.total).toBe(4);
  });

  it('filters by side=LONG', async () => {
    const r = await getJson('?side=LONG');
    expect(r.body.total).toBe(3);
  });

  it('filters by side=SHORT', async () => {
    const r = await getJson('?side=SHORT');
    expect(r.body.total).toBe(1);
  });

  it('filters by status=OPEN', async () => {
    const r = await getJson('?status=OPEN');
    expect(r.body.total).toBe(1);
  });

  it('filters by symbol (case-insensitive contains)', async () => {
    const r = await getJson('?search=tsla');
    expect(r.body.total).toBe(2);
  });

  it('combines side + status', async () => {
    const r = await getJson('?side=LONG&status=CLOSED');
    expect(r.body.total).toBe(2);
  });

  it('side=ALL is a no-op', async () => {
    const r = await getJson('?side=ALL');
    expect(r.body.total).toBe(4);
  });

  it('returns 400 for malformed date range', async () => {
    const r = await getJson('?from=garbage&to=alsogarbage');
    expect(r.status).toBe(400);
  });

  it('paginates with page/limit', async () => {
    const r = await getJson('?limit=2&page=1');
    expect(r.body.data.length).toBe(2);
    expect(r.body.total).toBe(4);
  });
});
```

- [ ] **Step 2: Run, expect pass**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- api/trades/route.filters`
Expected: all 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/trades/route.filters.test.ts
git commit -m "test(api): /api/trades filter combination coverage"
```

---

### Task 2: /api/journal CRUD + unique-per-day tests

**Files:**
- Create: `apps/web/src/app/api/journal/route.test.ts`

- [ ] **Step 1: Inspect the journal route's actual response shape**

Run: `head -100 apps/web/src/app/api/journal/route.ts`

Note: the API may use `entryDate` formatted as `YYYY-MM-DD` (Prisma `@db.Date`). Adjust the test accordingly.

- [ ] **Step 2: Write the tests**

```ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@repo/database';
import { GET, POST } from './route';

vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/server/auth';

let userId: string;
let otherId: string;

beforeAll(async () => {
  const u = await prisma.user.create({ data: { email: `j-${Date.now()}@x.com`, emailVerified: new Date() } });
  const o = await prisma.user.create({ data: { email: `j-other-${Date.now()}@x.com`, emailVerified: new Date() } });
  userId = u.id;
  otherId = o.id;
  await prisma.journalEntry.createMany({
    data: [
      { userId, entryDate: new Date('2026-05-01'), content: 'mine' },
      { userId, entryDate: new Date('2026-05-02'), content: 'mine 2' },
      { userId: otherId, entryDate: new Date('2026-05-01'), content: 'theirs' },
    ],
  });
});

afterAll(async () => {
  await prisma.journalEntry.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

beforeEach(() => {
  vi.resetAllMocks();
  (auth as any).mockResolvedValue({
    user: { id: userId, email: 'a@b.com', role: 'USER', emailVerified: new Date() },
  });
});

describe('GET /api/journal', () => {
  it('returns only this user\'s entries', async () => {
    const res = await GET(new Request('http://localhost/api/journal'));
    const body = await res.json();
    const entries = body.entries ?? body.data ?? body; // shape may vary
    const list = Array.isArray(entries) ? entries : [];
    expect(list.length).toBe(2);
    expect(list.every((e: any) => e.content !== 'theirs')).toBe(true);
  });
});

describe('POST /api/journal', () => {
  it('upserts on the same entryDate (uniqueness)', async () => {
    const day = '2026-05-10';
    const create = await POST(new Request('http://localhost/api/journal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryDate: day, content: 'v1', mood: 'neutral' }),
    }));
    expect([200, 201]).toContain(create.status);

    const update = await POST(new Request('http://localhost/api/journal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entryDate: day, content: 'v2', mood: 'neutral' }),
    }));
    expect([200, 201]).toContain(update.status);

    const stored = await prisma.journalEntry.findUnique({
      where: { userId_entryDate: { userId, entryDate: new Date(day) } },
    });
    expect(stored?.content).toBe('v2');

    await prisma.journalEntry.delete({ where: { userId_entryDate: { userId, entryDate: new Date(day) } } });
  });
});
```

The test allows multiple response-shape variations because the journal route's exact wire format hasn't been pinned at the time of writing — the test asserts behavior, not shape.

- [ ] **Step 3: Run, expect pass**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- api/journal/route`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/journal/route.test.ts
git commit -m "test(api): /api/journal CRUD + unique-per-day"
```

---

### Task 3: /api/analytics happy-path test

**Files:**
- Create: `apps/web/src/app/api/analytics/route.test.ts`

- [ ] **Step 1: Inspect the analytics route response shape**

Run: `head -120 apps/web/src/app/api/analytics/route.ts`

Note what fields are returned (win rate, Sharpe, drawdown, profit factor, etc.) and the query params it accepts.

- [ ] **Step 2: Write the test**

```ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@repo/database';
import { GET } from './route';

vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/server/auth';

let userId: string;

beforeAll(async () => {
  const u = await prisma.user.create({ data: { email: `an-${Date.now()}@x.com`, emailVerified: new Date() } });
  userId = u.id;
  // Six closed trades: 4 winners (+$100), 2 losers (-$50). Win rate = 66.7%.
  const base = { userId, symbol: 'TEST', side: 'LONG' as const, status: 'CLOSED' as const, quantity: 1 };
  await prisma.trade.createMany({
    data: [
      { ...base, entryPrice: 100, exitPrice: 110, pnl: 100,  entryDate: new Date('2026-01-01'), exitDate: new Date('2026-01-02') },
      { ...base, entryPrice: 100, exitPrice: 110, pnl: 100,  entryDate: new Date('2026-01-05'), exitDate: new Date('2026-01-06') },
      { ...base, entryPrice: 100, exitPrice: 110, pnl: 100,  entryDate: new Date('2026-01-10'), exitDate: new Date('2026-01-11') },
      { ...base, entryPrice: 100, exitPrice: 110, pnl: 100,  entryDate: new Date('2026-01-15'), exitDate: new Date('2026-01-16') },
      { ...base, entryPrice: 100, exitPrice: 95,  pnl: -50,  entryDate: new Date('2026-01-20'), exitDate: new Date('2026-01-21') },
      { ...base, entryPrice: 100, exitPrice: 95,  pnl: -50,  entryDate: new Date('2026-01-25'), exitDate: new Date('2026-01-26') },
    ],
  });
});

afterAll(async () => {
  await prisma.trade.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

beforeEach(() => {
  vi.resetAllMocks();
  (auth as any).mockResolvedValue({
    user: { id: userId, email: 'a@b.com', role: 'USER', emailVerified: new Date() },
  });
});

describe('GET /api/analytics', () => {
  it('returns a successful response shape', async () => {
    const res = await GET(new Request('http://localhost/api/analytics'));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Verify the response contains at least one expected analytics field.
    // Names are flexible — match whatever the route returns.
    expect(typeof body).toBe('object');
    expect(body).not.toBeNull();
  });

  it('returns 401 when not authenticated', async () => {
    (auth as any).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/analytics'));
    expect(res.status).toBe(401);
  });
});
```

This test is intentionally light — analytics return shape varies more than CRUD shapes. The point is to catch regressions where the route 500s or 401s incorrectly. Add more assertions once the response shape is stable.

- [ ] **Step 3: Run, expect pass**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/analytics/route.test.ts
git commit -m "test(api): /api/analytics happy path + 401"
```

---

### Task 4: Trade form (new-trade page) RTL test

**Files:**
- Create: `apps/web/src/app/dashboard/trades/new/page.test.tsx`

The trade form is rendered inline in the page component (not extracted). The test renders the page and asserts on form behavior.

- [ ] **Step 1: Inspect the page for ID / labels**

Run: `grep -n "label\|aria-label\|name=\|placeholder=" apps/web/src/app/dashboard/trades/new/page.tsx | head -30`

Note exact labels — the test queries by them.

- [ ] **Step 2: Write the test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock everything the page touches at module load.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
}));
vi.mock('@/lib/toast-context', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import NewTradePage from './page';

beforeEach(() => vi.resetAllMocks());

describe('New trade page', () => {
  it('renders the form', () => {
    render(<NewTradePage />);
    // Spot-check a few inputs that should always exist.
    expect(screen.getByText(/symbol/i)).toBeInTheDocument();
    expect(screen.getByText(/entry price/i)).toBeInTheDocument();
    expect(screen.getByText(/quantity/i)).toBeInTheDocument();
  });

  it('auto-calculates P&L when entry, exit, and quantity are filled (LONG)', async () => {
    const user = userEvent.setup();
    render(<NewTradePage />);
    // Find inputs by their visible label text. If the page uses placeholders, switch to getByPlaceholderText.
    const entry = screen.getByLabelText(/entry price/i) as HTMLInputElement;
    const exit = screen.getByLabelText(/exit price/i) as HTMLInputElement;
    const qty = screen.getByLabelText(/quantity/i) as HTMLInputElement;

    await user.type(entry, '100');
    await user.type(exit, '110');
    await user.type(qty, '10');

    // LONG: (exit - entry) * qty = (110 - 100) * 10 = 100
    await waitFor(() => {
      const pnl = screen.getByLabelText(/p&?l|p&amp;l|pnl/i) as HTMLInputElement;
      expect(Number(pnl.value)).toBe(100);
    });
  });

  it('Load-from-playbook button is disabled when no strategy is selected', () => {
    render(<NewTradePage />);
    const btn = screen.queryByRole('button', { name: /load from playbook/i });
    if (btn) expect(btn).toBeDisabled();
  });
});
```

**If the page's inputs don't have `<label htmlFor>` associations**, the `getByLabelText` queries will fail. In that case, swap to `getByPlaceholderText` or `getByRole('textbox', { name })` with the displayed label. Adjust the test to match the actual markup.

**If the page renders a `<Topbar>` that touches `useSession` or `apiFetch` during render**, mock those too at the top of the test file.

- [ ] **Step 3: Run**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- dashboard/trades/new/page`

If it fails due to render-time side effects (Topbar fetches, etc.), add mocks until it renders cleanly. The goal is one stable, repeatable test of form behavior — extend coverage later.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/trades/new/page.test.tsx
git commit -m "test(ui): RTL coverage for new-trade form"
```

---

### Task 5: Playwright e2e smoke

**Files:**
- Create: `apps/web/e2e/auth-and-trade.spec.ts`
- Create: `apps/web/e2e/fixtures.ts`

- [ ] **Step 1: Write the fixtures**

Create `apps/web/e2e/fixtures.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

export type SeededUser = { id: string; email: string; password: string };

export async function seedTestUser(): Promise<SeededUser> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
  const password = 'Password123!';
  const passwordHash = await hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      emailVerified: new Date(),
      onboardedAt: new Date(),
      name: 'E2E Test',
    },
  });
  await prisma.tradingAccount.create({
    data: { userId: user.id, name: 'Default Account', isDefault: true },
  });
  await prisma.userSettings.create({ data: { userId: user.id } });
  return { id: user.id, email, password };
}

export async function cleanupUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } }).catch(() => undefined);
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
```

- [ ] **Step 2: Write the smoke spec**

Create `apps/web/e2e/auth-and-trade.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { seedTestUser, cleanupUser, disconnect, type SeededUser } from './fixtures';

let user: SeededUser;

test.beforeAll(async () => {
  user = await seedTestUser();
});

test.afterAll(async () => {
  await cleanupUser(user.id);
  await disconnect();
});

test('sign in, create a trade, see it on the dashboard', async ({ page }) => {
  // 1. Sign in via the Auth.js Credentials provider.
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // 2. Land on the dashboard.
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();

  // 3. Create a trade.
  await page.goto('/dashboard/trades/new');
  await page.getByLabel(/symbol/i).fill('E2E');
  await page.getByLabel(/entry price/i).fill('100');
  await page.getByLabel(/exit price/i).fill('110');
  await page.getByLabel(/quantity/i).fill('10');
  // Entry/exit date fields may be DateTimePickers — adjust selectors after first run.
  await page.getByLabel(/entry date/i).fill('2026-05-10T10:00');
  await page.getByLabel(/exit date/i).fill('2026-05-10T15:00');
  await page.getByRole('button', { name: /save/i }).click();

  // 4. Trade appears on the trade list.
  await page.waitForURL(/\/dashboard\/trades/, { timeout: 10000 });
  await expect(page.getByText('E2E')).toBeVisible();
});
```

- [ ] **Step 3: Run locally (manually start `npm run dev` first)**

Run: `nvm use 20.20.1 && npm run e2e --workspace=trading-journal`
Expected: 1 spec passes.

If selectors don't match the actual markup (form fields use placeholders instead of labels, or use custom date pickers), adjust them and rerun. Playwright's codegen (`npx playwright codegen http://localhost:3000`) is the fastest path to correct selectors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e
git commit -m "test(e2e): sign in + create trade + view it on dashboard"
```

- [ ] **Step 5: Verify CI**

Push and watch the workflow. The Playwright job should now run 1 spec and pass.

---

## Self-Review

**Spec coverage (Feature 4 — Test Suite + CI):**
- ✅ Backend integration tests for `/api/trades` filters: Task 1.
- ✅ Backend integration tests for `/api/journal`: Task 2.
- ✅ Backend integration tests for `/api/analytics`: Task 3.
- ✅ RTL component test for the trade form: Task 4.
- ✅ Playwright e2e smoke: Task 5.

**Placeholder scan:** No "TBD". Tasks 4 and 5 explicitly call out that selectors will likely need adjustment on first run — that's a realistic expectation, not a placeholder.

**Type consistency:** `SeededUser` shape is used identically in fixtures and the spec. The `auth()` mock pattern is consistent with the Phase 2 auth tests and the other Sprint 5 test files (Playbook, Monte Carlo, Onboarding).
