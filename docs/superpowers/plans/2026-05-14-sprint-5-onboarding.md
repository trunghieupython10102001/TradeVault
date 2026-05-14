# Sprint 5 — Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New users land in a three-step setup wizard the first time they hit the dashboard, and see helpful empty states across Dashboard / Trades / Journal until they have data. A dismissible "Getting started" checklist surfaces on the dashboard for the first week or until all items are complete.

**Architecture:** New `User.onboardedAt: DateTime?` column. Server-side check in the dashboard layout redirects to `/onboarding` if null. Wizard is one page with internal step state; saves use existing `/api/settings` and `/api/accounts/:id` PATCH endpoints. A new `POST /api/onboarding/complete` route finalizes. Empty-state and checklist components are shared.

**Tech Stack:** Prisma, Next.js (server components + client wizard), React.

**Reference spec:** `docs/superpowers/specs/2026-05-14-sprint-5-design.md` §Feature 2.

**Pre-condition:** Test scaffolding plan merged. Auth roadmap Phase 2 (Auth.js + `requireUser`) merged.

**End-state verification:** A freshly registered user is redirected to `/onboarding`, completes (or skips) the wizard, lands on the dashboard, and sees the "Getting started" checklist. After logging one trade, one journal entry, and one tag, the checklist auto-hides. Existing users (with `onboardedAt` already set by the migration) never see the wizard.

---

## File Map

### Schema + API
- Modify: `packages/database/prisma/schema.prisma` — add `User.onboardedAt`.
- New migration: `packages/database/prisma/migrations/<timestamp>_add_user_onboarded_at/migration.sql`.
- Create: `apps/web/src/app/api/onboarding/complete/route.ts`
- Create: `apps/web/src/app/api/onboarding/complete/route.test.ts`

### Frontend
- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/app/onboarding/OnboardingWizard.tsx`
- Create: `apps/web/src/components/EmptyState.tsx`
- Create: `apps/web/src/components/dashboard/GettingStartedCard.tsx`
- Modify: `apps/web/src/app/dashboard/layout.tsx` (or `dashboard/page.tsx`) — redirect if not onboarded.
- Modify: `apps/web/src/app/dashboard/page.tsx` — render `<GettingStartedCard>` above the metric grid when conditions met.
- Modify: `apps/web/src/app/dashboard/trades/page.tsx` — empty-state when no trades.
- Modify: `apps/web/src/app/dashboard/journal/page.tsx` — empty-state when no entries.

---

### Task 1: Schema migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

- [ ] **Step 1: Add the column**

In `packages/database/prisma/schema.prisma`, inside the `User` model, add:

```prisma
onboardedAt DateTime? @map("onboarded_at")
```

- [ ] **Step 2: Generate the migration**

Run: `nvm use 20.20.1 && npx prisma migrate dev --create-only --name add_user_onboarded_at --schema=packages/database/prisma/schema.prisma`

Open the generated migration. It should contain:

```sql
ALTER TABLE "users" ADD COLUMN "onboarded_at" TIMESTAMP(3);
```

Append a backfill so existing users don't see the wizard:

```sql
-- Existing users predate the wizard — mark them onboarded.
UPDATE "users" SET "onboarded_at" = NOW() WHERE "onboarded_at" IS NULL;
```

- [ ] **Step 3: Apply locally**

Run: `nvm use 20.20.1 && npx prisma migrate dev --schema=packages/database/prisma/schema.prisma`
Expected: applies; Prisma client regenerated.

- [ ] **Step 4: Verify**

Run: `psql "$DATABASE_URL" -c 'SELECT email, onboarded_at FROM users LIMIT 5;'`
Expected: every row has a non-null `onboarded_at`.

- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma
git commit -m "feat(db): add User.onboardedAt with backfill for existing users"
```

---

### Task 2: Onboarding-complete endpoint (TDD)

**Files:**
- Create: `apps/web/src/app/api/onboarding/complete/route.ts`
- Create: `apps/web/src/app/api/onboarding/complete/route.test.ts`

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
    data: { email: `onb-${Date.now()}@x.com`, emailVerified: new Date(), onboardedAt: null },
  });
  userId = u.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } });
});

beforeEach(() => {
  vi.resetAllMocks();
  (auth as any).mockResolvedValue({
    user: { id: userId, email: 'a@b.com', role: 'USER', emailVerified: new Date() },
  });
});

describe('POST /api/onboarding/complete', () => {
  it('sets onboardedAt to NOW()', async () => {
    const res = await POST(new Request('http://localhost/api/onboarding/complete', { method: 'POST' }));
    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(u?.onboardedAt).not.toBeNull();
  });

  it('is idempotent', async () => {
    const firstRes = await POST(new Request('http://localhost/api/onboarding/complete', { method: 'POST' }));
    expect(firstRes.status).toBe(200);
    const u1 = await prisma.user.findUnique({ where: { id: userId } });
    await new Promise((r) => setTimeout(r, 20));
    const secondRes = await POST(new Request('http://localhost/api/onboarding/complete', { method: 'POST' }));
    expect(secondRes.status).toBe(200);
    const u2 = await prisma.user.findUnique({ where: { id: userId } });
    // First write set onboardedAt; second write must NOT overwrite (idempotent).
    expect(u1?.onboardedAt?.toISOString()).toBe(u2?.onboardedAt?.toISOString());
  });

  it('returns 401 when not authenticated', async () => {
    (auth as any).mockResolvedValue(null);
    const res = await POST(new Request('http://localhost/api/onboarding/complete', { method: 'POST' }));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

Create `apps/web/src/app/api/onboarding/complete/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { withAuth } from '@/server/auth/guard';

export const POST = withAuth(async (_request, _ctx, user) => {
  // Idempotent: only set onboardedAt if it's currently null.
  await prisma.user.update({
    where: { id: user.id, onboardedAt: null },
    data: { onboardedAt: new Date() },
  }).catch(() => {
    // P2025 (record-not-found) means it was already onboarded — silently succeed.
  });
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/onboarding
git commit -m "feat(onboarding): POST /api/onboarding/complete (idempotent)"
```

---

### Task 3: Onboarding wizard page

**Files:**
- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/app/onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Build the server-side page**

Create `apps/web/src/app/onboarding/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { prisma } from '@repo/database';
import { requireUser } from '@/server/auth/guard';
import OnboardingWizard from './OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await requireUser();
  const [dbUser, settings, defaultAccount] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { onboardedAt: true } }),
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
    prisma.tradingAccount.findFirst({
      where: { userId: user.id, isDefault: true },
      select: { id: true, name: true, broker: true, currency: true, initialBalance: true },
    }),
  ]);

  if (dbUser?.onboardedAt) {
    redirect('/dashboard');
  }

  return (
    <OnboardingWizard
      initialCapital={settings ? Number(settings.startingCapital) : 10_000}
      initialStrategies={settings?.strategies ?? []}
      defaultAccount={defaultAccount}
    />
  );
}
```

- [ ] **Step 2: Build the wizard component**

Create `apps/web/src/app/onboarding/OnboardingWizard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type Account = {
  id: string;
  name: string;
  broker: string | null;
  currency: string;
  initialBalance: number | string;
};

type Props = {
  initialCapital: number;
  initialStrategies: string[];
  defaultAccount: Account | null;
};

const COMMON_STRATEGIES = ['Breakout', 'Scalping', 'Swing', 'News', 'Mean Reversion'];
const COMMON_BROKERS = ['MT4', 'MT5', 'Interactive Brokers', 'ThinkorSwim', 'Tradovate', 'Exness', 'Other'];

export default function OnboardingWizard({ initialCapital, initialStrategies, defaultAccount }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [capital, setCapital] = useState(initialCapital);

  // Step 2
  const [accountName, setAccountName] = useState(defaultAccount?.name ?? 'Default Account');
  const [broker, setBroker] = useState(defaultAccount?.broker ?? '');
  const [currency, setCurrency] = useState(defaultAccount?.currency ?? 'USD');

  // Step 3
  const [strategies, setStrategies] = useState<string[]>(
    initialStrategies.length > 0 ? initialStrategies : [...COMMON_STRATEGIES],
  );
  const [newStrategy, setNewStrategy] = useState('');

  const [busy, setBusy] = useState(false);

  async function saveStep1() {
    setBusy(true);
    await apiFetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ startingCapital: capital }),
    });
    setBusy(false);
    setStep(2);
  }

  async function saveStep2() {
    if (!defaultAccount) {
      // Edge case: user has no default account (registration didn't create one).
      // Create one inline.
      setBusy(true);
      await apiFetch('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: accountName, broker: broker || null, currency, initialBalance: capital, isDefault: true }),
      });
      setBusy(false);
    } else {
      setBusy(true);
      await apiFetch(`/api/accounts/${defaultAccount.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: accountName, broker: broker || null, currency, initialBalance: capital }),
      });
      setBusy(false);
    }
    setStep(3);
  }

  async function saveStep3AndFinish() {
    setBusy(true);
    await apiFetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ strategies }),
    });
    await apiFetch('/api/onboarding/complete', { method: 'POST' });
    setBusy(false);
    router.replace('/dashboard');
  }

  async function skip() {
    setBusy(true);
    await apiFetch('/api/onboarding/complete', { method: 'POST' });
    setBusy(false);
    router.replace('/dashboard');
  }

  return (
    <div style={{ maxWidth: 560, margin: '40px auto' }}>
      <p>Step {step} of 3</p>

      {step === 1 && (
        <section>
          <h1>Set your starting capital</h1>
          <p>How much trading capital are you starting with? You can change this later.</p>
          <input
            type="number"
            min={0}
            step={100}
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
          />
          <div>
            <button onClick={saveStep1} disabled={busy || capital <= 0}>Next</button>
            <button onClick={skip} disabled={busy}>Skip for now</button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1>Your first trading account</h1>
          <p>Tell us about the account or broker you'll be journaling.</p>
          <label>Account name
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </label>
          <label>Broker
            <select value={broker} onChange={(e) => setBroker(e.target.value)}>
              <option value="">— None —</option>
              {COMMON_BROKERS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label>Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="JPY">JPY</option>
              <option value="AUD">AUD</option>
            </select>
          </label>
          <div>
            <button onClick={() => setStep(1)} disabled={busy}>Back</button>
            <button onClick={saveStep2} disabled={busy || !accountName.trim()}>Next</button>
            <button onClick={skip} disabled={busy}>Skip for now</button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h1>Pick your strategies</h1>
          <p>Select the strategies you'll be tagging trades with. Add custom ones below.</p>
          <ul>
            {[...new Set([...COMMON_STRATEGIES, ...strategies])].map((s) => (
              <li key={s}>
                <label>
                  <input
                    type="checkbox"
                    checked={strategies.includes(s)}
                    onChange={() => {
                      setStrategies(strategies.includes(s)
                        ? strategies.filter((x) => x !== s)
                        : [...strategies, s]);
                    }}
                  />
                  {s}
                </label>
              </li>
            ))}
          </ul>
          <div>
            <input
              value={newStrategy}
              placeholder="Custom strategy name"
              onChange={(e) => setNewStrategy(e.target.value)}
            />
            <button
              onClick={() => {
                if (newStrategy.trim() && !strategies.includes(newStrategy.trim())) {
                  setStrategies([...strategies, newStrategy.trim()]);
                }
                setNewStrategy('');
              }}
              disabled={!newStrategy.trim()}
            >+ Add</button>
          </div>
          <div>
            <button onClick={() => setStep(2)} disabled={busy}>Back</button>
            <button onClick={saveStep3AndFinish} disabled={busy}>Finish</button>
            <button onClick={skip} disabled={busy}>Skip for now</button>
          </div>
        </section>
      )}
    </div>
  );
}
```

CSS-wise: copy the existing card styling from the login or register page; the markup above is unstyled but functionally complete.

- [ ] **Step 3: Manual smoke**

Register a new user (the existing register page). After register completes, the layout (Task 4) will redirect to `/onboarding`. Walk all three steps. Use "Back" between steps; data persists. Refresh mid-wizard — data still there (because we save on Next, not on Finish). Try "Skip for now" at step 2; confirm redirect to `/dashboard` and `onboardedAt` is set in DB.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/onboarding
git commit -m "feat(onboarding): three-step wizard at /onboarding"
```

---

### Task 4: Redirect on dashboard if not onboarded

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx` (preferred — wraps every dashboard page)

If `dashboard/layout.tsx` doesn't exist as a server component, modify `apps/web/src/app/dashboard/page.tsx` and replicate the check on each dashboard-protected page. Test before deciding.

- [ ] **Step 1: Locate the dashboard wrapper**

Run: `ls apps/web/src/app/dashboard/layout.tsx 2>/dev/null && cat apps/web/src/app/dashboard/layout.tsx`

If no layout file exists, create one:

```tsx
import { redirect } from 'next/navigation';
import { prisma } from '@repo/database';
import { requireUser } from '@/server/auth/guard';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { onboardedAt: true },
  });
  if (!dbUser?.onboardedAt) {
    redirect('/onboarding');
  }
  return <>{children}</>;
}
```

If a layout file already exists, add the same `onboardedAt` check inside the existing function before rendering children. Don't replace existing markup — only add the check.

- [ ] **Step 2: Manual smoke**

In psql: `UPDATE users SET onboarded_at = NULL WHERE email = 'your-test-user@example.com';`
Visit `/dashboard` → redirected to `/onboarding`.
Complete or skip the wizard → land on `/dashboard` → never redirected again.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/layout.tsx
git commit -m "feat(onboarding): redirect to /onboarding when onboardedAt is null"
```

---

### Task 5: Reusable EmptyState component

**Files:**
- Create: `apps/web/src/components/EmptyState.tsx`
- Create: `apps/web/src/components/EmptyState.test.tsx`

- [ ] **Step 1: Write the component test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('renders title, description, and CTA', () => {
    render(
      <EmptyState
        title="No trades yet"
        description="Log your first trade to see metrics."
        ctaLabel="Log a trade"
        ctaHref="/dashboard/trades/new"
      />,
    );
    expect(screen.getByRole('heading', { name: 'No trades yet' })).toBeInTheDocument();
    expect(screen.getByText('Log your first trade to see metrics.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log a trade' })).toHaveAttribute('href', '/dashboard/trades/new');
  });

  it('renders without a CTA when ctaLabel is omitted', () => {
    render(<EmptyState title="Empty" description="Nothing here." />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

Create `apps/web/src/components/EmptyState.tsx`:

```tsx
import Link from 'next/link';

type Props = {
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export default function EmptyState({ title, description, ctaLabel, ctaHref }: Props) {
  return (
    <div style={{
      padding: '48px 24px',
      border: '1px dashed var(--border)',
      borderRadius: 8,
      textAlign: 'center',
      maxWidth: 480,
      margin: '32px auto',
    }}>
      <h2 style={{ margin: '0 0 8px 0' }}>{title}</h2>
      <p style={{ margin: '0 0 16px 0', opacity: 0.7 }}>{description}</p>
      {ctaLabel && ctaHref && (
        <Link href={ctaHref}>
          <span style={{
            display: 'inline-block', padding: '8px 16px',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            borderRadius: 4, textDecoration: 'none',
          }}>{ctaLabel}</span>
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/EmptyState.tsx apps/web/src/components/EmptyState.test.tsx
git commit -m "feat(ui): reusable EmptyState component"
```

---

### Task 6: Wire EmptyState into Dashboard / Trades / Journal

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx`
- Modify: `apps/web/src/app/dashboard/trades/page.tsx`
- Modify: `apps/web/src/app/dashboard/journal/page.tsx`

- [ ] **Step 1: Dashboard page**

In `apps/web/src/app/dashboard/page.tsx`, find where the trade data is fetched. After the fetch, before the metric grid, conditionally render:

```tsx
{tradeCount === 0 && (
  <EmptyState
    title="No trades yet"
    description="Log your first trade to start seeing your performance metrics."
    ctaLabel="Log a trade"
    ctaHref="/dashboard/trades/new"
  />
)}
```

The metric grid + charts can still render below (they'll show zeros), but the empty state explains why.

Add the import: `import EmptyState from '@/components/EmptyState';`

- [ ] **Step 2: Trades list page**

In `apps/web/src/app/dashboard/trades/page.tsx`, after fetching trades, before rendering the trade table:

```tsx
{trades.length === 0 && !loading && (
  <EmptyState
    title="No trades yet"
    description="Log your first trade to start your journal."
    ctaLabel="Log a trade"
    ctaHref="/dashboard/trades/new"
  />
)}
```

Render the table only when `trades.length > 0`.

- [ ] **Step 3: Journal page**

In `apps/web/src/app/dashboard/journal/page.tsx`, similar pattern — render `<EmptyState>` with a CTA that scrolls/focuses the inline create form (use `window.scrollTo` to the form's `<form>` element, or use a state flag to expand it).

```tsx
{entries.length === 0 && !loading && (
  <EmptyState
    title="No journal entries yet"
    description="Reflect on your trading day to track your mindset and confidence."
    ctaLabel="Write your first entry"
    ctaHref="#new-entry-form"
  />
)}
```

Add `id="new-entry-form"` to the form element so the anchor link scrolls there.

- [ ] **Step 4: Manual smoke**

Sign in as a brand-new user with no trades, no journal entries. Visit each of the three pages — empty state appears on each. Log a trade → dashboard + trades list empty states disappear. Write a journal entry → journal empty state disappears.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard
git commit -m "feat(ui): empty-state CTAs on Dashboard, Trades, Journal"
```

---

### Task 7: Getting-started checklist card

**Files:**
- Create: `apps/web/src/components/dashboard/GettingStartedCard.tsx`
- Modify: `apps/web/src/app/dashboard/page.tsx` — render it above the metric grid.

- [ ] **Step 1: Build the card**

Create `apps/web/src/components/dashboard/GettingStartedCard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const DISMISS_KEY = 'gettingStarted.dismissed';

type Props = {
  hasOnboarded: boolean;
  hasTrade: boolean;
  hasJournal: boolean;
  hasTag: boolean;
  daysSinceOnboard: number;
};

export default function GettingStartedCard(props: Props) {
  const allDone = props.hasOnboarded && props.hasTrade && props.hasJournal && props.hasTag;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  // Visible if: not yet all done, AND (still in first 7 days OR not dismissed yet)
  const showByTime = props.daysSinceOnboard <= 7;
  if (allDone || dismissed || !showByTime) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  const items = [
    { done: props.hasOnboarded, label: 'Set up your account', href: '/dashboard/settings' },
    { done: props.hasTrade,    label: 'Log your first trade', href: '/dashboard/trades/new' },
    { done: props.hasJournal,  label: 'Write a journal entry', href: '/dashboard/journal' },
    { done: props.hasTag,      label: 'Create a tag', href: '/dashboard/settings' },
  ];

  return (
    <div style={{
      padding: 16, border: '1px solid var(--border)', borderRadius: 8,
      marginBottom: 16, background: 'var(--bg-secondary)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Getting started</h3>
        <button onClick={dismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0 0' }}>
        {items.map((it, i) => (
          <li key={i} style={{ padding: '6px 0', opacity: it.done ? 0.5 : 1 }}>
            <span style={{ marginRight: 8 }}>{it.done ? '✓' : '○'}</span>
            {it.done ? (
              <span style={{ textDecoration: 'line-through' }}>{it.label}</span>
            ) : (
              <Link href={it.href}>{it.label}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Wire into the dashboard page**

In `apps/web/src/app/dashboard/page.tsx` (which should already be a server component), add the data fetch + the card:

```tsx
import GettingStartedCard from '@/components/dashboard/GettingStartedCard';
import { differenceInDays } from 'date-fns';

// inside the page function, after `user` is obtained:
const [tradeCount, journalCount, tagCount, dbUser] = await Promise.all([
  prisma.trade.count({ where: userScope(user.id) }),
  prisma.journalEntry.count({ where: userScope(user.id) }),
  prisma.tag.count({ where: userScope(user.id) }),
  prisma.user.findUnique({ where: { id: user.id }, select: { onboardedAt: true } }),
]);

const daysSinceOnboard = dbUser?.onboardedAt
  ? differenceInDays(new Date(), dbUser.onboardedAt)
  : Infinity;

// in the JSX, ABOVE the metric grid:
<GettingStartedCard
  hasOnboarded={!!dbUser?.onboardedAt}
  hasTrade={tradeCount > 0}
  hasJournal={journalCount > 0}
  hasTag={tagCount > 0}
  daysSinceOnboard={daysSinceOnboard}
/>
```

`date-fns` is already a dependency of `apps/web` — confirm with `grep date-fns apps/web/package.json`.

- [ ] **Step 3: Manual smoke**

Sign in as a fresh user just past onboarding. Dashboard shows the card with all four items unchecked (except "Set up your account" which is ✓ because onboardedAt is set). Click "Log your first trade" → log one → return to dashboard → that row is now ✓. Repeat for journal entry and tag → card auto-hides once all four are complete. Refresh — still hidden. Then in psql, set `onboarded_at` back to 10 days ago → card still hidden (because all done). Set it to 2 days ago AND delete the trade → card reappears.

Dismiss the card. Refresh — still hidden. Open in incognito (different localStorage) → reappears.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/dashboard/GettingStartedCard.tsx apps/web/src/app/dashboard/page.tsx
git commit -m "feat(onboarding): dismissible getting-started checklist on dashboard"
```

---

## Self-Review

**Spec coverage (Feature 2):**
- ✅ `User.onboardedAt` column with backfill: Task 1.
- ✅ Three-step wizard (capital → account → strategies): Task 3.
- ✅ "Skip for now" available on every step: Task 3.
- ✅ Wizard data persists across steps (saves on each Next): Task 3.
- ✅ Redirect-on-dashboard for not-yet-onboarded: Task 4.
- ✅ Empty-state CTAs on Dashboard / Trades / Journal: Tasks 5–6.
- ✅ Shared `<EmptyState>` component: Task 5.
- ✅ Dismissible getting-started checklist with auto-hide and 7-day window: Task 7.
- ✅ localStorage-based dismissal: Task 7.

**Placeholder scan:** No "TBD". The inline-style approach to the new components is intentional — they don't have CSS modules yet, but the markup is functional and accessible.

**Type consistency:** `defaultAccount` type in wizard props matches the Prisma select shape (`{ id, name, broker, currency, initialBalance }`). `GettingStartedCard` props all booleans + one number — matches what the dashboard server component computes.
