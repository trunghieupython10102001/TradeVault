# Sprint 5 — Monte Carlo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward-looking risk analysis — given a user's historical closed trades, simulate N=1000 paths of the next K=100 trades and display percentile equity curves, ending-balance distribution, risk of ruin, and drawdown metrics.

**Architecture:** One pure simulation function in `apps/web/src/server/lib/monte-carlo.ts` (extensively unit-tested with a seeded RNG). One Route Handler that loads trades, decides return mode (R vs PCT), and calls the function. One page with a fan chart, histogram, and metric tiles.

**Tech Stack:** TypeScript, Prisma, Next.js Route Handler, Recharts, vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-14-sprint-5-design.md` §Feature 3.

**Pre-condition:** Test scaffolding plan merged.

**End-state verification:** A user with ≥20 closed trades can visit `/dashboard/analytics/monte-carlo`, see the fan chart and metrics, and tweak filters (account, strategy, date range). Below 20 trades, the page shows an empty state.

---

## File Map

- Create: `apps/web/src/server/lib/monte-carlo.ts`
- Create: `apps/web/src/server/lib/monte-carlo.test.ts`
- Create: `apps/web/src/app/api/analytics/monte-carlo/route.ts`
- Create: `apps/web/src/app/api/analytics/monte-carlo/route.test.ts`
- Create: `apps/web/src/app/dashboard/analytics/monte-carlo/page.tsx`
- Create: `apps/web/src/app/dashboard/analytics/monte-carlo/MonteCarloView.tsx` (client component with charts + filters)
- Modify: sidebar nav (`apps/web/src/components/layout/Sidebar.tsx` or wherever the Analytics link lives) — add Monte Carlo sub-link.

---

### Task 1: Pure simulation function (TDD)

**Files:**
- Create: `apps/web/src/server/lib/monte-carlo.ts`
- Create: `apps/web/src/server/lib/monte-carlo.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/server/lib/monte-carlo.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runMonteCarlo, MonteCarloInput, sampleSeeded } from './monte-carlo';

const baseInput = (overrides: Partial<MonteCarloInput> = {}): MonteCarloInput => ({
  returns: [1, -1, 2, -1.5, 0.5, -0.5, 1.2, -0.8, 0.3, 1.1],
  simulations: 100,
  pathLength: 20,
  startingEquity: 10_000,
  riskPercent: 1, // 1% per trade
  mode: 'R',
  seed: 42,
  ...overrides,
});

describe('runMonteCarlo', () => {
  it('returns percentile series of length pathLength + 1', () => {
    const r = runMonteCarlo(baseInput());
    expect(r.percentiles.p5.length).toBe(21);
    expect(r.percentiles.p50.length).toBe(21);
    expect(r.percentiles.p95.length).toBe(21);
  });

  it('first percentile entry equals startingEquity for all three bands', () => {
    const r = runMonteCarlo(baseInput());
    expect(r.percentiles.p5[0]).toBe(10_000);
    expect(r.percentiles.p50[0]).toBe(10_000);
    expect(r.percentiles.p95[0]).toBe(10_000);
  });

  it('percentile ordering holds at every step (p5 ≤ p50 ≤ p95)', () => {
    const r = runMonteCarlo(baseInput());
    for (let i = 0; i < r.percentiles.p50.length; i++) {
      expect(r.percentiles.p5[i]).toBeLessThanOrEqual(r.percentiles.p50[i]);
      expect(r.percentiles.p50[i]).toBeLessThanOrEqual(r.percentiles.p95[i]);
    }
  });

  it('endingBalances length equals simulations and is sorted ascending', () => {
    const r = runMonteCarlo(baseInput());
    expect(r.endingBalances.length).toBe(100);
    for (let i = 1; i < r.endingBalances.length; i++) {
      expect(r.endingBalances[i]).toBeGreaterThanOrEqual(r.endingBalances[i - 1]);
    }
  });

  it('riskOfRuin is 0 when no losing path is large enough to bankrupt', () => {
    const r = runMonteCarlo(baseInput({
      returns: [0.1, 0.2, 0.3], // all positive R
      pathLength: 50,
    }));
    expect(r.riskOfRuin).toBe(0);
  });

  it('riskOfRuin is high when paths can blow up', () => {
    const r = runMonteCarlo(baseInput({
      returns: [-1, -1, -1], // pure losses
      pathLength: 200,
      riskPercent: 50, // huge risk per trade
      simulations: 100,
    }));
    expect(r.riskOfRuin).toBeGreaterThan(0.9);
  });

  it('seeded output is deterministic across runs', () => {
    const a = runMonteCarlo(baseInput({ seed: 12345 }));
    const b = runMonteCarlo(baseInput({ seed: 12345 }));
    expect(a.endingBalances).toEqual(b.endingBalances);
  });

  it('mode=PCT applies returns as percentage points', () => {
    const r = runMonteCarlo(baseInput({
      mode: 'PCT',
      returns: [5, -5], // 5% gain or 5% loss
      pathLength: 1,
      simulations: 200,
    }));
    // After one trade, p5 should be near 9500 (5% loss), p95 near 10500 (5% gain).
    expect(r.percentiles.p5.at(-1)).toBeCloseTo(9500, -1); // within $10
    expect(r.percentiles.p95.at(-1)).toBeCloseTo(10500, -1);
  });

  it('throws when returns array is empty', () => {
    expect(() => runMonteCarlo(baseInput({ returns: [] }))).toThrow();
  });
});

describe('sampleSeeded', () => {
  it('produces values in [0, returns.length) from a seed', () => {
    const r = sampleSeeded([10, 20, 30], 5, 1);
    expect(r.length).toBe(5);
    r.forEach((v) => expect([10, 20, 30]).toContain(v));
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- monte-carlo`
Expected: module-not-found.

- [ ] **Step 3: Implement the simulator**

Create `apps/web/src/server/lib/monte-carlo.ts`:

```ts
export type MonteCarloMode = 'R' | 'PCT';

export type MonteCarloInput = {
  /** Historical returns to sample with replacement. R-multiples (mode='R') or P&L percents (mode='PCT'). */
  returns: number[];
  /** Number of simulated paths. */
  simulations: number;
  /** Trades per simulated path. */
  pathLength: number;
  /** Starting equity. */
  startingEquity: number;
  /** Risk per trade as percent of equity. Only used in mode='R'. */
  riskPercent: number;
  /** Equity update mode. */
  mode: MonteCarloMode;
  /** Optional seed for deterministic output. */
  seed?: number;
};

export type MonteCarloResult = {
  percentiles: { p5: number[]; p50: number[]; p95: number[] };
  endingBalances: number[];
  finalP5: number;
  finalP50: number;
  finalP95: number;
  riskOfRuin: number;
  maxDrawdownP50: number;
  maxDrawdownP95: number;
};

// Mulberry32 PRNG — small, deterministic, good enough for bootstrap simulation.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exposed for tests. Returns `count` samples from `source` using a seeded RNG. */
export function sampleSeeded<T>(source: T[], count: number, seed: number): T[] {
  const rand = mulberry32(seed);
  const out: T[] = new Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = source[Math.floor(rand() * source.length)];
  }
  return out;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  if (input.returns.length === 0) {
    throw new Error('runMonteCarlo: returns array is empty');
  }
  const rand = mulberry32(input.seed ?? Math.floor(Math.random() * 1e9));

  // equityPaths[s][t] = equity at step t of simulation s
  const equityPaths: number[][] = new Array(input.simulations);
  const maxDrawdowns: number[] = new Array(input.simulations);
  let ruinCount = 0;

  for (let s = 0; s < input.simulations; s++) {
    const path: number[] = new Array(input.pathLength + 1);
    path[0] = input.startingEquity;
    let peak = input.startingEquity;
    let maxDD = 0;
    let ruined = false;

    for (let t = 1; t <= input.pathLength; t++) {
      const prev = path[t - 1];
      const r = input.returns[Math.floor(rand() * input.returns.length)];
      let next: number;
      if (input.mode === 'R') {
        next = prev * (1 + (r * input.riskPercent) / 100);
      } else {
        next = prev * (1 + r / 100);
      }
      if (next <= 0) {
        next = 0;
        ruined = true;
      }
      path[t] = next;
      if (next > peak) peak = next;
      const dd = peak > 0 ? (peak - next) / peak : 0;
      if (dd > maxDD) maxDD = dd;
    }

    equityPaths[s] = path;
    maxDrawdowns[s] = maxDD;
    if (ruined) ruinCount++;
  }

  // Compute percentile bands per step.
  const p5: number[] = new Array(input.pathLength + 1);
  const p50: number[] = new Array(input.pathLength + 1);
  const p95: number[] = new Array(input.pathLength + 1);
  for (let t = 0; t <= input.pathLength; t++) {
    const slice = new Array(input.simulations);
    for (let s = 0; s < input.simulations; s++) slice[s] = equityPaths[s][t];
    slice.sort((a, b) => a - b);
    p5[t] = percentile(slice, 0.05);
    p50[t] = percentile(slice, 0.5);
    p95[t] = percentile(slice, 0.95);
  }

  const endingBalances = equityPaths.map((p) => p[p.length - 1]).sort((a, b) => a - b);
  const sortedDD = [...maxDrawdowns].sort((a, b) => a - b);

  return {
    percentiles: { p5, p50, p95 },
    endingBalances,
    finalP5: p5[p5.length - 1],
    finalP50: p50[p50.length - 1],
    finalP95: p95[p95.length - 1],
    riskOfRuin: ruinCount / input.simulations,
    maxDrawdownP50: percentile(sortedDD, 0.5),
    maxDrawdownP95: percentile(sortedDD, 0.95),
  };
}
```

- [ ] **Step 4: Run, expect pass**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- monte-carlo`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/lib/monte-carlo.ts apps/web/src/server/lib/monte-carlo.test.ts
git commit -m "feat(analytics): Monte Carlo simulation function with seeded RNG"
```

---

### Task 2: Monte Carlo route

**Files:**
- Create: `apps/web/src/app/api/analytics/monte-carlo/route.ts`
- Create: `apps/web/src/app/api/analytics/monte-carlo/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@repo/database';
import { POST } from './route';

vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/server/auth';

let userId: string;

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `mc-${Date.now()}@x.com`, emailVerified: new Date() },
  });
  userId = u.id;
  // Seed 25 closed trades with R-multiples so we exceed the 20-trade threshold.
  const trades = Array.from({ length: 25 }, (_, i) => ({
    userId,
    symbol: 'TEST',
    side: 'LONG' as const,
    status: 'CLOSED' as const,
    entryPrice: 100,
    exitPrice: 100 + i,
    quantity: 1,
    rMultiple: i % 2 === 0 ? 1.5 : -1,
    entryDate: new Date(`2026-01-${(i % 28) + 1}T10:00:00Z`),
    exitDate: new Date(`2026-01-${(i % 28) + 1}T15:00:00Z`),
  }));
  await prisma.trade.createMany({ data: trades });
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

function postBody(body: object) {
  return new Request('http://localhost/api/analytics/monte-carlo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/analytics/monte-carlo', () => {
  it('returns a result for R-mode with >=20 trades', async () => {
    const res = await POST(postBody({ simulations: 200, pathLength: 50 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.returnType).toBe('R');
    expect(body.inputSampleSize).toBeGreaterThanOrEqual(20);
    expect(body.percentiles.p50.length).toBe(51); // pathLength + 1
  });

  it('returns 400 when fewer than 20 trades match filters', async () => {
    const res = await POST(postBody({ strategy: 'ImpossibleStrategy' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not enough trades/i);
    expect(body.count).toBe(0);
  });

  it('returns 401 when not authenticated', async () => {
    (auth as any).mockResolvedValue(null);
    const res = await POST(postBody({}));
    expect(res.status).toBe(401);
  });

  it('clamps simulations and pathLength to safe ranges', async () => {
    const res = await POST(postBody({ simulations: 999999, pathLength: 999999 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.percentiles.p50.length).toBeLessThanOrEqual(501); // pathLength capped at 500
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/analytics/monte-carlo/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { withAuth } from '@/server/auth/guard';
import { userScope } from '@/server/db/scope';
import { runMonteCarlo } from '@/server/lib/monte-carlo';

const bodySchema = z.object({
  simulations: z.number().int().min(100).max(10_000).default(1000),
  pathLength: z.number().int().min(10).max(500).default(100),
  accountId: z.string().optional(),
  strategy: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const POST = withAuth(async (request, _ctx, user) => {
  const json = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }
  const { simulations, pathLength, accountId, strategy, from, to } = parsed.data;

  // Build the filter
  const where: Record<string, unknown> = { status: 'CLOSED' };
  if (accountId) where.tradingAccountId = accountId; // renamed in Auth Phase 2
  if (strategy) where.strategy = strategy;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    where.exitDate = dateFilter;
  }

  const trades = await prisma.trade.findMany({
    where: userScope(user.id, where),
    select: { rMultiple: true, pnlPercent: true },
  });

  // Decide mode: R if every trade has rMultiple, else PCT.
  const allHaveR = trades.length > 0 && trades.every((t) => t.rMultiple !== null);
  const mode: 'R' | 'PCT' = allHaveR ? 'R' : 'PCT';
  const returns = mode === 'R'
    ? trades.map((t) => Number(t.rMultiple!))
    : trades.filter((t) => t.pnlPercent !== null).map((t) => Number(t.pnlPercent!));

  if (returns.length < 20) {
    return NextResponse.json(
      { error: 'Not enough trades to run a meaningful simulation. Need at least 20 closed trades with returns data.', count: returns.length },
      { status: 400 },
    );
  }

  // Pull starting equity + risk per trade from settings.
  const settings = await prisma.userSettings.findUnique({ where: { userId: user.id } });
  const startingEquity = settings ? Number(settings.startingCapital) : 10_000;
  const riskPercent = settings ? Number(settings.riskPerTrade) : 1;

  const result = runMonteCarlo({
    returns,
    simulations,
    pathLength,
    startingEquity,
    riskPercent,
    mode,
  });

  return NextResponse.json({
    returnType: mode,
    inputSampleSize: returns.length,
    startingEquity,
    ...result,
  });
});
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/analytics/monte-carlo
git commit -m "feat(analytics): POST /api/analytics/monte-carlo"
```

---

### Task 3: Monte Carlo page UI

**Files:**
- Create: `apps/web/src/app/dashboard/analytics/monte-carlo/page.tsx`
- Create: `apps/web/src/app/dashboard/analytics/monte-carlo/MonteCarloView.tsx`
- Modify: sidebar nav (Analytics link)

- [ ] **Step 1: Build the page shell (server component)**

Create `apps/web/src/app/dashboard/analytics/monte-carlo/page.tsx`:

```tsx
import { prisma } from '@repo/database';
import { requireUser } from '@/server/auth/guard';
import { userScope } from '@/server/db/scope';
import MonteCarloView from './MonteCarloView';

export const dynamic = 'force-dynamic';

export default async function MonteCarloPage() {
  const user = await requireUser();
  const [closedCount, accounts, settings] = await Promise.all([
    prisma.trade.count({ where: userScope(user.id, { status: 'CLOSED' }) }),
    prisma.tradingAccount.findMany({
      where: userScope(user.id),
      select: { id: true, name: true },
    }),
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
  ]);

  return (
    <div>
      <h1>Monte Carlo Simulation</h1>
      <p>
        Bootstrap-shuffle your historical returns to estimate the distribution of possible
        outcomes over the next 100 trades.
      </p>
      <MonteCarloView
        closedTradeCount={closedCount}
        accounts={accounts}
        strategies={settings?.strategies ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 2: Build the client view (filters + charts + metrics)**

Create `apps/web/src/app/dashboard/analytics/monte-carlo/MonteCarloView.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from '@/lib/api';

type Account = { id: string; name: string };

type Result = {
  returnType: 'R' | 'PCT';
  inputSampleSize: number;
  startingEquity: number;
  percentiles: { p5: number[]; p50: number[]; p95: number[] };
  endingBalances: number[];
  finalP5: number;
  finalP50: number;
  finalP95: number;
  riskOfRuin: number;
  maxDrawdownP50: number;
  maxDrawdownP95: number;
};

type Props = {
  closedTradeCount: number;
  accounts: Account[];
  strategies: string[];
};

export default function MonteCarloView({ closedTradeCount, accounts, strategies }: Props) {
  const [accountId, setAccountId] = useState('');
  const [strategy, setStrategy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [simulations, setSimulations] = useState(1000);
  const [pathLength, setPathLength] = useState(100);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setError(null);
    const body: Record<string, unknown> = { simulations, pathLength };
    if (accountId) body.accountId = accountId;
    if (strategy) body.strategy = strategy;
    if (from) body.from = new Date(from).toISOString();
    if (to) body.to = new Date(to).toISOString();
    const res = await apiFetch('/api/analytics/monte-carlo', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setLoading(false);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed');
      setResult(null);
      return;
    }
    setResult(data);
  }

  if (closedTradeCount < 20) {
    return (
      <div>
        <p>You need at least 20 closed trades. You currently have {closedTradeCount}.</p>
      </div>
    );
  }

  const fanData = result?.percentiles.p50.map((_, i) => ({
    trade: i,
    p5: result.percentiles.p5[i],
    p50: result.percentiles.p50[i],
    p95: result.percentiles.p95[i],
  })) ?? [];

  // Bucket ending balances for histogram (20 buckets)
  const histo = result ? bucketize(result.endingBalances, 20) : [];

  return (
    <div>
      <section>
        <h2>Filters</h2>
        <label>Account
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">All</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>Strategy
          <select value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="">All</option>
            {strategies.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Simulations
          <input type="number" min={100} max={10000} value={simulations} onChange={(e) => setSimulations(Number(e.target.value))} />
        </label>
        <label>Path length
          <input type="number" min={10} max={500} value={pathLength} onChange={(e) => setPathLength(Number(e.target.value))} />
        </label>
        <button onClick={run} disabled={loading}>{loading ? 'Running…' : 'Run simulation'}</button>
      </section>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {result && (
        <>
          <section>
            <p>Mode: {result.returnType === 'R' ? 'R-multiple' : 'P&L %'} ({result.inputSampleSize} trades sampled)</p>
            {result.inputSampleSize < 50 && (
              <p><em>Results are noisy below 50 trades.</em></p>
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Metric label="P5 final" value={fmtCurrency(result.finalP5)} />
              <Metric label="Median final" value={fmtCurrency(result.finalP50)} />
              <Metric label="P95 final" value={fmtCurrency(result.finalP95)} />
              <Metric label="Risk of ruin" value={(result.riskOfRuin * 100).toFixed(1) + '%'} />
              <Metric label="Median max DD" value={(result.maxDrawdownP50 * 100).toFixed(1) + '%'} />
              <Metric label="95th-pctile max DD" value={(result.maxDrawdownP95 * 100).toFixed(1) + '%'} />
            </div>
          </section>

          <section>
            <h2>Equity curve (5th / 50th / 95th percentile)</h2>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={fanData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="trade" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="p95" stroke="#aaa" fill="#aaa" fillOpacity={0.15} name="P95" />
                <Area type="monotone" dataKey="p50" stroke="#333" fill="#333" fillOpacity={0.4} name="Median" />
                <Area type="monotone" dataKey="p5" stroke="#aaa" fill="#aaa" fillOpacity={0.15} name="P5" />
              </AreaChart>
            </ResponsiveContainer>
          </section>

          <section>
            <h2>Ending balance distribution</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={histo}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" />
              </BarChart>
            </ResponsiveContainer>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 12, border: '1px solid var(--border)', minWidth: 140 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function bucketize(values: number[], bucketCount: number) {
  if (values.length === 0) return [];
  const min = values[0];
  const max = values[values.length - 1];
  const width = (max - min) / bucketCount || 1;
  const buckets: { label: string; count: number }[] = Array.from({ length: bucketCount }, (_, i) => ({
    label: fmtCurrency(min + width * i),
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(bucketCount - 1, Math.floor((v - min) / width));
    buckets[idx].count++;
  }
  return buckets;
}
```

- [ ] **Step 3: Add the nav link**

Find the sidebar's Analytics entry:

Run: `grep -rln "/dashboard/analytics" apps/web/src/components/layout`

Open the file and add a sub-link to `/dashboard/analytics/monte-carlo` labeled "Monte Carlo" beneath the existing Analytics item. Pattern-match how Sprint 4's command palette / shortcuts items are wired.

- [ ] **Step 4: Manual smoke**

Visit `/dashboard/analytics/monte-carlo`. Confirm:
- < 20 closed trades → empty-state message with the count.
- ≥ 20 → page shows filters and a "Run simulation" button. Click → fan chart, histogram, metrics tiles appear within ~200ms.
- Tweak simulations (e.g., 5000) → still completes fast (<1s).
- Set strategy filter to one with few trades → 400 with "Not enough trades" surfaces in the UI.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/analytics/monte-carlo apps/web/src/components/layout
git commit -m "feat(analytics): Monte Carlo page with fan chart + histogram"
```

---

## Self-Review

**Spec coverage (Feature 3):**
- ✅ Pure function with the locked `MonteCarloInput` / `MonteCarloResult` shape: Task 1.
- ✅ N=1000 × K=100 default, R vs PCT mode decided server-side: Task 2.
- ✅ Filters (account, strategy, date range): Task 2 (route) + Task 3 (UI).
- ✅ Empty state below 20 trades: Task 3.
- ✅ "Noisy below 50" warning: Task 3.
- ✅ Fan chart, histogram, metric tiles: Task 3.

**Placeholder scan:** No "TBD". The Recharts color choices are intentional grayscale — restyle later if the design system demands it.

**Type consistency:** `MonteCarloResult` from the pure function matches what the API returns (with two extra fields: `returnType`, `inputSampleSize`, `startingEquity`). The client `Result` type matches that augmented shape.
