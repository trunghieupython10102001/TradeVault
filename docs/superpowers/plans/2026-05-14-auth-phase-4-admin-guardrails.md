# Auth Phase 4: Admin Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the `requireAdmin()` route guard as a finished, testable feature with one example admin route demonstrating it works. Add a documented SQL escape hatch to promote a user. No admin UI is built — that's deliberate per spec.

**Architecture:** `requireAdmin()` already exists (built in Phase 2 Task 5). This phase exercises it: one admin-only Route Handler (`GET /api/admin/users`) returns a paginated list of users for operator-level support. The `Role` enum already lives in the schema. The promotion path is a documented SQL snippet, not a UI.

**Tech Stack:** Existing — no new deps.

**Reference spec:** `docs/superpowers/specs/2026-05-14-auth-roadmap-design.md` Phase 4.

**Pre-condition:** Phase 3 is merged.

**End-state verification:** A user with `role = 'ADMIN'` can hit `GET /api/admin/users` and see a list of users. A `USER` gets 403. Promotion via a documented SQL snippet works.

---

## File Map

- Create: `apps/web/src/app/api/admin/users/route.ts` — GET list of users (admin-only, demonstrates `withAdmin` / `requireAdmin`).
- Create: `apps/web/src/app/api/admin/users/route.test.ts`
- Create: `docs/admin/promoting-an-admin.md` — operator runbook.
- Modify: `apps/web/src/server/db/scope.spec.ts` — already allows `requireAdmin` as a safe pattern; verify the new file passes.

---

### Task 1: First admin route — list users

**Files:**
- Create: `apps/web/src/app/api/admin/users/route.ts`
- Create: `apps/web/src/app/api/admin/users/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { GET } from './route';
import { prisma } from '@repo/database';

vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/server/auth';

let adminId: string;
let userId: string;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: `admin-${Date.now()}@x.com`, role: 'ADMIN', emailVerified: new Date() },
  });
  const user = await prisma.user.create({
    data: { email: `user-${Date.now()}@x.com`, role: 'USER', emailVerified: new Date() },
  });
  adminId = admin.id;
  userId = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });
});

beforeEach(() => vi.resetAllMocks());

function asAdmin() {
  (auth as any).mockResolvedValue({
    user: { id: adminId, email: 'admin@x.com', role: 'ADMIN', emailVerified: new Date() },
  });
}
function asUser() {
  (auth as any).mockResolvedValue({
    user: { id: userId, email: 'user@x.com', role: 'USER', emailVerified: new Date() },
  });
}

describe('GET /api/admin/users', () => {
  it('returns the list when admin', async () => {
    asAdmin();
    const res = await GET(new Request('http://localhost/api/admin/users'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.users.length).toBeGreaterThan(0);
    // Should never include passwordHash.
    expect(body.users[0]).not.toHaveProperty('passwordHash');
  });

  it('returns 403 for a non-admin user', async () => {
    asUser();
    const res = await GET(new Request('http://localhost/api/admin/users'));
    expect(res.status).toBe(403);
  });

  it('returns 401 when not authenticated', async () => {
    (auth as any).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/admin/users'));
    expect(res.status).toBe(401);
  });

  it('paginates with ?page and ?limit', async () => {
    asAdmin();
    const res = await GET(new Request('http://localhost/api/admin/users?page=1&limit=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.length).toBe(1);
    expect(typeof body.total).toBe('number');
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- admin/users`
Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `apps/web/src/app/api/admin/users/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { withAdmin } from '@/server/auth/guard';

export const GET = withAdmin(async (request) => {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, name: true, role: true,
        emailVerified: true, createdAt: true,
        _count: { select: { trades: true } },
      },
    }),
    prisma.user.count(),
  ]);

  return NextResponse.json({ users, total, page, limit });
});
```

Notice: the `select` explicitly excludes `passwordHash`, `totpSecret`, `mfaBackupCodes`. Admin reading shouldn't leak credentials.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Verify the scope-leak static check is happy**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- scope.spec`
Expected: passes — `requireAdmin` is on the SAFE_PATTERN allowlist baked into the check.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/admin
git commit -m "feat(auth): admin guardrail with GET /api/admin/users"
```

---

### Task 2: Document the promotion runbook

**Files:**
- Create: `docs/admin/promoting-an-admin.md`

- [ ] **Step 1: Write the runbook**

Create `docs/admin/promoting-an-admin.md`:

```markdown
# Promoting a user to admin

There is no admin UI — promotion happens via SQL. This is intentional: the only person who should ever need this is the operator, and the operator has database access.

## Steps

1. Connect to the production database (Render dashboard → trading-journal-db → Connect → External connection string).
2. Run:

   ```sql
   UPDATE users SET role = 'ADMIN' WHERE email = 'operator@example.com';
   ```

3. The user must sign out and sign back in for the new role to take effect (session is database-backed; the cached `role` on the session record is set at sign-in time).

## Demoting

```sql
UPDATE users SET role = 'USER' WHERE email = 'former-admin@example.com';
```

## Listing current admins

```sql
SELECT id, email, name, created_at FROM users WHERE role = 'ADMIN';
```

## What admins can do today

- `GET /api/admin/users` — list users (paginated).

Anything more — suspending users, viewing trades on their behalf, support tools — is a future feature, not built yet.
```

- [ ] **Step 2: Commit**

```bash
git add docs/admin/promoting-an-admin.md
git commit -m "docs: runbook for promoting an admin via SQL"
```

---

### Task 3: Promote the operator to admin and verify in staging

This task is a one-off operator step, not a code change. Treat it as a checkpoint.

- [ ] **Step 1: Operator runs the SQL on the production DB**

```sql
UPDATE users SET role = 'ADMIN' WHERE email = '<operator email>';
```

- [ ] **Step 2: Sign out, sign back in**

- [ ] **Step 3: Hit the admin endpoint**

```bash
curl -i https://<production-domain>/api/admin/users \
  --cookie '<paste session cookie value from devtools>'
```

Expected: 200 with `{ users: [...], total, page, limit }`.

- [ ] **Step 4: Verify 403 for a non-admin session**

Optionally sign in as a non-admin user and hit the same endpoint. Expected: 403.

No commit — this is an operations check.

---

## Self-Review

**Spec coverage check (Phase 4):**
- ✅ `role` enum and column: already in DB from Phase 2 Task 3.
- ✅ `requireAdmin()` helper: already implemented in Phase 2 Task 5.
- ✅ Bootstrap script / SQL: Task 2's runbook.
- ✅ No admin UI: confirmed — only the API and the SQL runbook.

**Placeholder scan:** None.

**Why this phase is small:** Most of the work was front-loaded into Phase 2 (the `Role` enum and `requireAdmin` helper). Phase 4 just exercises what's already there with one example route and one doc.
