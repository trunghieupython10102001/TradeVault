# Sprint 5 — Playbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let traders save a reusable setup template per strategy and pre-fill it into the trade form on demand.

**Architecture:** New `Playbook` model with `@@unique([userId, strategy])`. Standard CRUD API behind the existing auth guards. Settings page for management. Single button on the trade form that loads a strategy's playbook into the setup-description and checklist fields after a confirm dialog.

**Tech Stack:** Prisma, Next.js Route Handlers, React, vitest, RTL.

**Reference spec:** `docs/superpowers/specs/2026-05-14-sprint-5-design.md` §Feature 1.

**Pre-condition:** Test scaffolding plan (`2026-05-14-sprint-5-test-scaffolding.md`) is merged so CI is live.

**End-state verification:** A user can create a playbook for the "Breakout" strategy, then create a new trade with strategy = "Breakout" and click "Load from playbook" to pre-fill the setup description and append the checklist. Deleting the playbook removes it. Renaming the strategy in settings leaves the playbook orphaned but still visible on the settings page with a delete CTA.

---

## File Map

### Backend
- Modify: `packages/database/prisma/schema.prisma` — add `Playbook` model + relation on `User`.
- New migration: `packages/database/prisma/migrations/<timestamp>_add_playbook/migration.sql`.
- Create: `apps/web/src/app/api/playbooks/route.ts` — GET list, POST upsert.
- Create: `apps/web/src/app/api/playbooks/[strategy]/route.ts` — GET one, DELETE.
- Create: `apps/web/src/app/api/playbooks/route.test.ts`
- Create: `apps/web/src/app/api/playbooks/[strategy]/route.test.ts`

### Frontend
- Create: `apps/web/src/app/dashboard/settings/playbook/page.tsx`
- Create: `apps/web/src/app/dashboard/settings/playbook/PlaybookEditor.tsx` (client component with the form)
- Create: `apps/web/src/components/trades/LoadFromPlaybookButton.tsx`
- Create: `apps/web/src/components/trades/LoadFromPlaybookButton.test.tsx`
- Modify: `apps/web/src/app/dashboard/trades/new/page.tsx` — add the button near the strategy field.
- Modify: `apps/web/src/app/dashboard/trades/[id]/edit/page.tsx` — same change.
- Modify: `apps/web/src/app/dashboard/settings/page.tsx` (or wherever the settings nav lives) — add a link to the Playbook page.

---

### Task 1: Add the Playbook schema

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- New migration directory under `packages/database/prisma/migrations/`

- [ ] **Step 1: Add the model**

Append to `packages/database/prisma/schema.prisma` (before the closing of the file, after existing models):

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

Then add to the `User` model's relations list:

```prisma
playbooks Playbook[]
```

- [ ] **Step 2: Generate the migration**

Run: `nvm use 20.20.1 && npx prisma migrate dev --name add_playbook --schema=packages/database/prisma/schema.prisma`
Expected: migration created and applied locally; Prisma client regenerated.

- [ ] **Step 3: Sanity-check in psql**

Run: `psql "$DATABASE_URL" -c '\d playbooks'`
Expected: shows columns `id, user_id, strategy, title, setup, checklist, created_at, updated_at` and a unique constraint on `(user_id, strategy)`.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma
git commit -m "feat(db): add Playbook model with unique(user, strategy)"
```

---

### Task 2: Implement GET /api/playbooks (list)

**Files:**
- Create: `apps/web/src/app/api/playbooks/route.ts`
- Create: `apps/web/src/app/api/playbooks/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/playbooks/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@repo/database';

vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/server/auth';
import { GET, POST } from './route';

let userId: string;
let otherId: string;

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `pb-${Date.now()}@x.com`, emailVerified: new Date() },
  });
  const o = await prisma.user.create({
    data: { email: `pb-other-${Date.now()}@x.com`, emailVerified: new Date() },
  });
  userId = u.id;
  otherId = o.id;
  await prisma.playbook.createMany({
    data: [
      { userId, strategy: 'Breakout', title: 'BO', setup: 'My BO setup', checklist: ['vol > avg', 'clean break'] },
      { userId, strategy: 'Swing', title: 'SW', setup: 'My swing setup', checklist: [] },
      { userId: otherId, strategy: 'Breakout', title: 'O', setup: 'Other user', checklist: [] },
    ],
  });
});

afterAll(async () => {
  await prisma.playbook.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
});

beforeEach(() => vi.resetAllMocks());

function asUser(id: string) {
  (auth as any).mockResolvedValue({
    user: { id, email: 'a@b.com', role: 'USER', emailVerified: new Date() },
  });
}

describe('GET /api/playbooks', () => {
  it('returns only this user\'s playbooks', async () => {
    asUser(userId);
    const res = await GET(new Request('http://localhost/api/playbooks'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playbooks.length).toBe(2);
    expect(body.playbooks.map((p: any) => p.strategy).sort()).toEqual(['Breakout', 'Swing']);
  });

  it('returns 401 when not authenticated', async () => {
    (auth as any).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/playbooks'));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- api/playbooks/route`
Expected: module-not-found.

- [ ] **Step 3: Implement GET**

Create `apps/web/src/app/api/playbooks/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { withAuth, withVerifiedAuth } from '@/server/auth/guard';
import { userScope } from '@/server/db/scope';

export const GET = withAuth(async (_request, _ctx, user) => {
  const playbooks = await prisma.playbook.findMany({
    where: userScope(user.id),
    orderBy: { strategy: 'asc' },
  });
  return NextResponse.json({ playbooks });
});

const upsertSchema = z.object({
  strategy: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  setup: z.string().max(8_000).default(''),
  checklist: z.array(z.string().min(1).max(200)).max(50).default([]),
});

export const POST = withVerifiedAuth(async (request, _ctx, user) => {
  const json = await request.json().catch(() => null);
  const parsed = upsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;
  const playbook = await prisma.playbook.upsert({
    where: { userId_strategy: { userId: user.id, strategy: data.strategy } },
    update: { title: data.title, setup: data.setup, checklist: data.checklist },
    create: { userId: user.id, ...data },
  });
  return NextResponse.json({ playbook });
});
```

Note: `auth/guard.ts` from Phase 2 of the auth roadmap exports both `withAuth` and `withVerifiedAuth`. If the auth roadmap isn't merged yet, fall back to `withAuth` for both and add a TODO comment to switch POST to `withVerifiedAuth` once verification gates exist.

- [ ] **Step 4: Run tests, expect pass**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- api/playbooks/route`
Expected: all listed `GET` tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/playbooks/route.ts apps/web/src/app/api/playbooks/route.test.ts
git commit -m "feat(playbook): GET/POST /api/playbooks"
```

---

### Task 3: Implement GET + DELETE for /api/playbooks/[strategy]

**Files:**
- Create: `apps/web/src/app/api/playbooks/[strategy]/route.ts`
- Create: `apps/web/src/app/api/playbooks/[strategy]/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/api/playbooks/[strategy]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '@repo/database';

vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/server/auth';
import { GET, DELETE } from './route';

let userId: string;
let strategy = 'Breakout';

beforeAll(async () => {
  const u = await prisma.user.create({
    data: { email: `pb-id-${Date.now()}@x.com`, emailVerified: new Date() },
  });
  userId = u.id;
  await prisma.playbook.create({
    data: { userId, strategy, title: 'BO', setup: 'My BO setup', checklist: ['x'] },
  });
});

afterAll(async () => {
  await prisma.playbook.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
});

beforeEach(() => {
  vi.resetAllMocks();
  (auth as any).mockResolvedValue({
    user: { id: userId, email: 'a@b.com', role: 'USER', emailVerified: new Date() },
  });
});

function ctx(strategy: string) {
  return { params: Promise.resolve({ strategy }) };
}

describe('GET /api/playbooks/[strategy]', () => {
  it('returns the playbook', async () => {
    const res = await GET(new Request('http://localhost/api/playbooks/Breakout'), ctx('Breakout'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playbook.strategy).toBe('Breakout');
  });

  it('returns 404 for an unknown strategy', async () => {
    const res = await GET(new Request('http://localhost/api/playbooks/Unknown'), ctx('Unknown'));
    expect(res.status).toBe(404);
  });

  it('URL-decodes the strategy param', async () => {
    await prisma.playbook.create({
      data: { userId, strategy: 'Mean Reversion', title: 'MR', setup: '', checklist: [] },
    });
    const res = await GET(new Request('http://localhost/api/playbooks/Mean%20Reversion'), ctx('Mean Reversion'));
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/playbooks/[strategy]', () => {
  it('deletes the playbook', async () => {
    await prisma.playbook.create({
      data: { userId, strategy: 'Scalp', title: 'S', setup: '', checklist: [] },
    });
    const res = await DELETE(new Request('http://localhost/api/playbooks/Scalp', { method: 'DELETE' }), ctx('Scalp'));
    expect(res.status).toBe(200);
    const after = await prisma.playbook.findFirst({ where: { userId, strategy: 'Scalp' } });
    expect(after).toBeNull();
  });

  it('returns 404 when deleting non-existent', async () => {
    const res = await DELETE(new Request('http://localhost/api/playbooks/Nope', { method: 'DELETE' }), ctx('Nope'));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement the route**

Create `apps/web/src/app/api/playbooks/[strategy]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { withAuth, withVerifiedAuth } from '@/server/auth/guard';
import { userScope } from '@/server/db/scope';

type Ctx = { params: Promise<{ strategy: string }> };

export const GET = withAuth(async (_request, { params }: Ctx, user) => {
  const { strategy } = await params;
  const playbook = await prisma.playbook.findFirst({
    where: userScope(user.id, { strategy }),
  });
  if (!playbook) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ playbook });
});

export const DELETE = withVerifiedAuth(async (_request, { params }: Ctx, user) => {
  const { strategy } = await params;
  const result = await prisma.playbook.deleteMany({
    where: userScope(user.id, { strategy }),
  });
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/playbooks/\[strategy\]
git commit -m "feat(playbook): GET/DELETE /api/playbooks/:strategy"
```

---

### Task 4: Playbook settings page

**Files:**
- Create: `apps/web/src/app/dashboard/settings/playbook/page.tsx`
- Create: `apps/web/src/app/dashboard/settings/playbook/PlaybookEditor.tsx`
- Modify: settings nav (find via `grep -l "playbook\|Settings" apps/web/src/components/layout`)

- [ ] **Step 1: Build the page (server component for initial data fetch)**

Create `apps/web/src/app/dashboard/settings/playbook/page.tsx`:

```tsx
import { prisma } from '@repo/database';
import { requireUser } from '@/server/auth/guard';
import { userScope } from '@/server/db/scope';
import PlaybookEditor from './PlaybookEditor';

export const dynamic = 'force-dynamic';

export default async function PlaybookSettingsPage() {
  const user = await requireUser();
  const [playbooks, settings] = await Promise.all([
    prisma.playbook.findMany({
      where: userScope(user.id),
      orderBy: { strategy: 'asc' },
    }),
    prisma.userSettings.findUnique({ where: { userId: user.id } }),
  ]);
  const strategies = settings?.strategies ?? [];

  return (
    <div>
      <h1>Playbook</h1>
      <p>Save a default setup template for each strategy. The trade form can pre-fill from these.</p>
      <PlaybookEditor initialPlaybooks={playbooks} availableStrategies={strategies} />
    </div>
  );
}
```

- [ ] **Step 2: Build the editor component**

Create `apps/web/src/app/dashboard/settings/playbook/PlaybookEditor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

type Playbook = {
  id: string;
  strategy: string;
  title: string;
  setup: string;
  checklist: string[];
};

type Props = {
  initialPlaybooks: Playbook[];
  availableStrategies: string[];
};

export default function PlaybookEditor({ initialPlaybooks, availableStrategies }: Props) {
  const [playbooks, setPlaybooks] = useState(initialPlaybooks);
  const [editing, setEditing] = useState<Playbook | null>(null);
  const [draft, setDraft] = useState<Playbook>({ id: '', strategy: '', title: '', setup: '', checklist: [] });
  const toast = useToast();

  const orphaned = playbooks.filter((p) => !availableStrategies.includes(p.strategy));
  const eligibleStrategies = availableStrategies.filter((s) => !playbooks.some((p) => p.strategy === s));

  function startNew() {
    setEditing({ id: '', strategy: '', title: '', setup: '', checklist: [] });
    setDraft({ id: '', strategy: '', title: '', setup: '', checklist: [] });
  }

  function startEdit(p: Playbook) {
    setEditing(p);
    setDraft({ ...p });
  }

  function addChecklistRow() {
    setDraft({ ...draft, checklist: [...draft.checklist, ''] });
  }

  function setChecklistRow(i: number, v: string) {
    const next = [...draft.checklist];
    next[i] = v;
    setDraft({ ...draft, checklist: next });
  }

  function removeChecklistRow(i: number) {
    setDraft({ ...draft, checklist: draft.checklist.filter((_, ix) => ix !== i) });
  }

  async function save() {
    const res = await apiFetch('/api/playbooks', {
      method: 'POST',
      body: JSON.stringify({
        strategy: draft.strategy,
        title: draft.title,
        setup: draft.setup,
        checklist: draft.checklist.filter((c) => c.trim().length > 0),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error || 'Save failed');
      return;
    }
    const body = await res.json();
    const next = playbooks.filter((p) => p.strategy !== body.playbook.strategy).concat(body.playbook);
    next.sort((a, b) => a.strategy.localeCompare(b.strategy));
    setPlaybooks(next);
    setEditing(null);
    toast.success('Playbook saved');
  }

  async function remove(strategy: string) {
    if (!confirm(`Delete playbook for "${strategy}"?`)) return;
    const res = await apiFetch(`/api/playbooks/${encodeURIComponent(strategy)}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    setPlaybooks(playbooks.filter((p) => p.strategy !== strategy));
    toast.success('Playbook deleted');
  }

  return (
    <div>
      <button type="button" onClick={startNew} disabled={eligibleStrategies.length === 0 && !editing}>
        + Add playbook
      </button>

      {playbooks.length === 0 && <p>No playbooks yet.</p>}

      <ul>
        {playbooks.map((p) => (
          <li key={p.id}>
            <strong>{p.strategy}</strong> — {p.title}
            {!availableStrategies.includes(p.strategy) && (
              <em> (strategy no longer in your list)</em>
            )}
            <button onClick={() => startEdit(p)}>Edit</button>
            <button onClick={() => remove(p.strategy)}>Delete</button>
          </li>
        ))}
      </ul>

      {editing && (
        <div role="dialog" aria-label="Edit playbook">
          <label>
            Strategy
            <select
              value={draft.strategy}
              onChange={(e) => setDraft({ ...draft, strategy: e.target.value })}
              disabled={!!editing.id}
            >
              <option value="">— Select —</option>
              {editing.id
                ? <option value={editing.strategy}>{editing.strategy}</option>
                : eligibleStrategies.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Title
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label>Setup
            <textarea value={draft.setup} onChange={(e) => setDraft({ ...draft, setup: e.target.value })} rows={6} />
          </label>
          <div>
            <p>Checklist</p>
            {draft.checklist.map((c, i) => (
              <div key={i}>
                <input value={c} onChange={(e) => setChecklistRow(i, e.target.value)} />
                <button onClick={() => removeChecklistRow(i)}>×</button>
              </div>
            ))}
            <button onClick={addChecklistRow}>+ Add row</button>
          </div>
          <button onClick={save} disabled={!draft.strategy || !draft.title}>Save</button>
          <button onClick={() => setEditing(null)}>Cancel</button>
        </div>
      )}

      {orphaned.length > 0 && (
        <div>
          <h3>Orphaned playbooks</h3>
          <p>These playbooks reference strategies you no longer have in your settings.</p>
          <ul>
            {orphaned.map((p) => (
              <li key={p.id}>
                {p.strategy} — <button onClick={() => remove(p.strategy)}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

CSS / styling: copy the patterns from `apps/web/src/app/dashboard/settings/page.tsx`. Use existing CSS modules where they make sense; the markup above is minimal and unstyled but functional.

- [ ] **Step 3: Add the nav link**

Find the settings nav:

Run: `grep -rln "dashboard/settings" apps/web/src/components/layout`

Open the result. Add a new link to `/dashboard/settings/playbook` labeled "Playbook" between existing settings tabs.

- [ ] **Step 4: Manual smoke**

Start dev server. Visit `/dashboard/settings/playbook`. Add a playbook for "Breakout" with title "BO" and setup text + two checklist items. Refresh — it persists. Edit, delete. Add another, then rename a strategy in the main settings page so the playbook orphans — return and confirm it shows in "Orphaned playbooks" section.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/settings/playbook apps/web/src/components/layout
git commit -m "feat(playbook): settings page for creating/editing playbooks"
```

---

### Task 5: "Load from playbook" button on the trade form (TDD)

**Files:**
- Create: `apps/web/src/components/trades/LoadFromPlaybookButton.tsx`
- Create: `apps/web/src/components/trades/LoadFromPlaybookButton.test.tsx`
- Modify: `apps/web/src/app/dashboard/trades/new/page.tsx`
- Modify: `apps/web/src/app/dashboard/trades/[id]/edit/page.tsx`

- [ ] **Step 1: Write the component test**

Create `apps/web/src/components/trades/LoadFromPlaybookButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoadFromPlaybookButton from './LoadFromPlaybookButton';

// Mock apiFetch — the button calls /api/playbooks/:strategy
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
import { apiFetch } from '@/lib/api';

// Mock confirm so dialogs don't block.
beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.resetAllMocks();
});

function setup(strategy: string, onLoad = vi.fn()) {
  render(<LoadFromPlaybookButton strategy={strategy} onLoad={onLoad} />);
  return { onLoad };
}

describe('LoadFromPlaybookButton', () => {
  it('is disabled when no strategy is selected', () => {
    setup('');
    expect(screen.getByRole('button', { name: /load from playbook/i })).toBeDisabled();
  });

  it('fetches and calls onLoad after confirm', async () => {
    (apiFetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ playbook: { setup: 'My BO setup', checklist: ['vol > avg', 'clean break'] } }),
    });
    const { onLoad } = setup('Breakout');
    fireEvent.click(screen.getByRole('button', { name: /load from playbook/i }));
    await waitFor(() => expect(onLoad).toHaveBeenCalledWith({
      setup: 'My BO setup',
      checklist: ['vol > avg', 'clean break'],
    }));
  });

  it('does nothing when confirm is declined', async () => {
    (apiFetch as any).mockResolvedValue({ ok: true, json: async () => ({ playbook: { setup: 'x', checklist: [] } }) });
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { onLoad } = setup('Breakout');
    fireEvent.click(screen.getByRole('button', { name: /load from playbook/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onLoad).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('handles 404 (no playbook for this strategy) silently', async () => {
    (apiFetch as any).mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'Not found' }) });
    const { onLoad } = setup('Breakout');
    fireEvent.click(screen.getByRole('button', { name: /load from playbook/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(onLoad).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/trades/LoadFromPlaybookButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';

type LoadedPlaybook = {
  setup: string;
  checklist: string[];
};

type Props = {
  strategy: string;
  onLoad: (data: LoadedPlaybook) => void;
};

export default function LoadFromPlaybookButton({ strategy, onLoad }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!strategy) return;
    if (!confirm('Load setup from playbook? Existing setup description will be replaced.')) return;
    setLoading(true);
    const res = await apiFetch(`/api/playbooks/${encodeURIComponent(strategy)}`);
    setLoading(false);
    if (!res.ok) return; // 404 = no playbook for this strategy; silent no-op
    const body = await res.json();
    onLoad({ setup: body.playbook.setup ?? '', checklist: body.playbook.checklist ?? [] });
  }

  return (
    <button type="button" onClick={handleClick} disabled={!strategy || loading}>
      {loading ? 'Loading…' : 'Load from playbook'}
    </button>
  );
}
```

- [ ] **Step 4: Run, expect pass**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- LoadFromPlaybook`
Expected: all 4 tests pass.

- [ ] **Step 5: Wire into the new-trade page**

In `apps/web/src/app/dashboard/trades/new/page.tsx`, find the JSX block that renders the Strategy `<select>` or `<input>` (search for `strategy`). Adjacent to it, add:

```tsx
<LoadFromPlaybookButton
  strategy={strategy}
  onLoad={({ setup, checklist }) => {
    const checklistBlock = checklist.length > 0
      ? '— Checklist —\n' + checklist.map((c) => `[ ] ${c}`).join('\n') + '\n\n'
      : '';
    setSetupDescription(checklistBlock + setup);
  }}
/>
```

Add the import: `import LoadFromPlaybookButton from '@/components/trades/LoadFromPlaybookButton';`

The checklist is rendered as a plaintext block at the top of the setup description (with `[ ]` markers). This avoids introducing a new field on the Trade model.

- [ ] **Step 6: Same change in the edit-trade page**

In `apps/web/src/app/dashboard/trades/[id]/edit/page.tsx`, apply the identical change.

- [ ] **Step 7: Manual smoke**

Open `/dashboard/trades/new`. Strategy dropdown empty → button disabled. Select "Breakout" (assuming you created a playbook in Task 4). Button enables → click → confirm dialog → setup description populates with checklist + setup body. Try a strategy with no playbook → click → confirm → silent (no error, no change).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/trades apps/web/src/app/dashboard/trades
git commit -m "feat(playbook): Load-from-playbook button on trade form"
```

---

## Self-Review

**Spec coverage (Feature 1):**
- ✅ Schema with `@@unique([userId, strategy])`: Task 1.
- ✅ API endpoints (list, get, upsert, delete): Tasks 2–3.
- ✅ Settings page CRUD + orphan handling: Task 4.
- ✅ Trade-form "Load from playbook" button with confirm dialog: Task 5.
- ✅ Empty setup / empty checklist supported (Zod schemas default to empty): Task 2.

**Placeholder scan:** No "TBD". The fallback "if auth roadmap isn't merged" note in Task 2 is a known-state callout, not an unspecified detail.

**Type consistency:** `LoadedPlaybook` shape `{ setup: string; checklist: string[] }` matches what the API returns (`playbook.setup`, `playbook.checklist`). The Playbook type used in `PlaybookEditor` matches the Prisma model fields.
