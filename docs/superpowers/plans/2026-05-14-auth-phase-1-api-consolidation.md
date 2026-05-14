# Auth Phase 1: API Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every Express route into Next.js Route Handlers under `apps/web/src/app/api/...`. Delete `apps/api`. Keep legacy JWT/Bearer/`localStorage` auth unchanged — that's swapped in Phase 2. End state: one Next.js server serves UI + API; `apps/web/next.config.ts` no longer rewrites `/api/*` to a separate service.

**Architecture:** Per-resource migration. Each Express route file is replicated as one or more Route Handlers. Shared business logic (Prisma queries via `@repo/database`, Zod validators, csvParser, calculations, broker adapters) moves to `apps/web/src/server/lib/`. The legacy JWT middleware becomes `apps/web/src/server/auth/legacy-jwt.ts` and is invoked at the top of every protected Route Handler.

**Tech Stack:** Next.js 16 (App Router), `@repo/database` (Prisma), `jsonwebtoken`, `zod`, vitest, Node ≥20.9.0.

**Reference spec:** `docs/superpowers/specs/2026-05-14-auth-roadmap-design.md` Phase 1.

**Pre-condition:** Phase 0 is merged. `AUTH_SECRET` is set in both local `.env` and Render.

**End-state verification:** All existing integration paths (login, list trades, dashboard metrics, analytics, journal CRUD, settings, accounts, tags, CSV import) work via `/api/...` against Next.js with no `apps/api` process running.

---

## File Map

### New files in `apps/web/src/server/`

- `apps/web/src/server/auth/legacy-jwt.ts` — extracts user ID from Bearer JWT; returns 401 NextResponse on failure.
- `apps/web/src/server/auth/legacy-jwt.test.ts`
- `apps/web/src/server/lib/calculations.ts` — moved from `apps/api/src/lib/calculations.ts`.
- `apps/web/src/server/lib/calculations.test.ts` — moved.
- `apps/web/src/server/lib/analytics-helpers.ts` — moved.
- `apps/web/src/server/lib/analytics-helpers.test.ts` — moved.
- `apps/web/src/server/lib/validators.ts` — moved.
- `apps/web/src/server/lib/validators.test.ts` — moved.
- `apps/web/src/server/lib/csvParser.ts` — moved.
- `apps/web/src/server/lib/csvParser.test.ts` — moved.
- `apps/web/src/server/lib/brokerAdapters/` — moved.

### New Route Handlers in `apps/web/src/app/api/`

- `apps/web/src/app/api/auth-legacy/login/route.ts`
- `apps/web/src/app/api/auth-legacy/register/route.ts`
- `apps/web/src/app/api/auth-legacy/me/route.ts`
- `apps/web/src/app/api/trades/route.ts` (GET list, POST create)
- `apps/web/src/app/api/trades/[id]/route.ts` (GET one, PATCH update, DELETE)
- `apps/web/src/app/api/trades/import/route.ts` (POST CSV import)
- `apps/web/src/app/api/dashboard/route.ts` (REPLACE existing proxy)
- `apps/web/src/app/api/analytics/route.ts`
- `apps/web/src/app/api/tags/route.ts`
- `apps/web/src/app/api/tags/[id]/route.ts`
- `apps/web/src/app/api/journal/route.ts`
- `apps/web/src/app/api/journal/[id]/route.ts`
- `apps/web/src/app/api/settings/route.ts`
- `apps/web/src/app/api/accounts/route.ts`
- `apps/web/src/app/api/accounts/[id]/route.ts`

### Modified files

- `apps/web/next.config.ts` — remove the `/api/:path*` rewrite.
- `apps/web/src/lib/auth-context.tsx` — `login`/`register` call `/api/auth-legacy/login` instead of the rewritten `/auth/login`. Token still stored in localStorage. Existing behavior preserved.
- `apps/web/src/lib/apiFetch.ts` (or wherever `apiFetch` lives) — confirm it points at relative `/api/...` paths.
- `render.yaml` — remove the `trading-journal-api` service block.
- Root `package.json` — remove `apps/api` from workspaces (do this in the final cleanup task).

### Deletions (final task)

- `apps/api/` (entire directory).
- The `next-auth` dep in `apps/web/package.json` — leave for Phase 2.

---

### Task 1: Add the `request` Express dev-dep (for tests) and align Prisma versions

**Files:**
- Modify: `apps/web/package.json`
- Modify: `packages/database/package.json`

**Why first:** Phase 1 introduces Next.js Route Handlers that share the Prisma client with `packages/database`. Today `packages/database` declares `@prisma/client: ^5.0.0` while `apps/web` declares `^7.4.0`. We align both to the version actually installed (whatever resolved into `apps/web/node_modules` — that's what's running in production today).

- [ ] **Step 1: Inspect actual installed version**

Run: `node -e "console.log(require('apps/web/node_modules/@prisma/client/package.json').version)"`
Record the printed version (likely `7.x.y`). Call this `$INSTALLED`.

- [ ] **Step 2: Align packages/database to that version**

In `packages/database/package.json`, change `@prisma/client` and `prisma` from `^5.0.0` to `^$INSTALLED` (use the major.minor that's installed, e.g. `^7.4.0`).

- [ ] **Step 3: Run install at the root**

Run: `nvm use 20.20.1 && npm install`
Expected: no errors; lockfile updates.

- [ ] **Step 4: Verify Prisma client still builds**

Run: `nvm use 20.20.1 && npm run build --workspace=@repo/database`
Expected: builds without TS errors.

- [ ] **Step 5: Commit**

```bash
git add packages/database/package.json package-lock.json
git commit -m "chore(deps): align @prisma/client across workspaces"
```

---

### Task 2: Move shared business logic into `apps/web/src/server/lib/`

**Files:**
- Create: `apps/web/src/server/lib/calculations.ts`, `.test.ts`
- Create: `apps/web/src/server/lib/analytics-helpers.ts`, `.test.ts`
- Create: `apps/web/src/server/lib/validators.ts`, `.test.ts`
- Create: `apps/web/src/server/lib/csvParser.ts`, `.test.ts`
- Create: `apps/web/src/server/lib/brokerAdapters/` (mirror the api tree)
- (Express still uses these via relative imports — keep `apps/api/src/lib/` for now; we'll delete the whole `apps/api` directory in the last task.)

The contents of these files do not change. They are copied byte-for-byte from `apps/api/src/lib/`.

- [ ] **Step 1: Create the directory and copy files**

```bash
mkdir -p apps/web/src/server/lib/brokerAdapters
cp apps/api/src/lib/calculations.ts apps/web/src/server/lib/
cp apps/api/src/lib/calculations.test.ts apps/web/src/server/lib/
cp apps/api/src/lib/analytics-helpers.ts apps/web/src/server/lib/
cp apps/api/src/lib/analytics-helpers.test.ts apps/web/src/server/lib/
cp apps/api/src/lib/validators.ts apps/web/src/server/lib/
cp apps/api/src/lib/validators.test.ts apps/web/src/server/lib/
cp apps/api/src/lib/csvParser.ts apps/web/src/server/lib/
cp apps/api/src/lib/csvParser.test.ts apps/web/src/server/lib/
cp -R apps/api/src/lib/brokerAdapters/. apps/web/src/server/lib/brokerAdapters/
```

- [ ] **Step 2: Run the moved tests under web's vitest**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- src/server/lib`
Expected: every test that ran in `apps/api/src/lib/*.test.ts` now passes when run from the web workspace. If imports are broken, fix relative paths inside the copied files. Do NOT change behavior.

- [ ] **Step 3: Verify the api workspace still passes its tests**

Run: `nvm use 20.20.1 && npm test --workspace=api`
Expected: still passes (we haven't touched apps/api yet).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/server/lib
git commit -m "refactor: copy shared business logic into apps/web/src/server/lib"
```

---

### Task 3: Implement the legacy JWT helper for Next.js (TDD)

**Files:**
- Create: `apps/web/src/server/auth/legacy-jwt.ts`
- Create: `apps/web/src/server/auth/legacy-jwt.test.ts`
- Modify: `apps/web/package.json` (add `jsonwebtoken`, `@types/jsonwebtoken`)

- [ ] **Step 1: Install jsonwebtoken in apps/web**

Run: `nvm use 20.20.1 && npm install jsonwebtoken --workspace=trading-journal && npm install --save-dev @types/jsonwebtoken --workspace=trading-journal`

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/server/auth/legacy-jwt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { getUserIdFromRequest } from './legacy-jwt';

const SECRET = 'test-secret';
process.env.AUTH_SECRET = SECRET;

function makeRequest(authHeader?: string): Request {
  return new Request('http://localhost/api/x', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

describe('getUserIdFromRequest', () => {
  it('returns the user id from a valid Bearer token', () => {
    const token = jwt.sign({ id: 'user-123', email: 'a@b.com' }, SECRET);
    const result = getUserIdFromRequest(makeRequest(`Bearer ${token}`));
    expect(result).toEqual({ userId: 'user-123' });
  });

  it('returns an error when no header is present', () => {
    const result = getUserIdFromRequest(makeRequest());
    expect(result).toEqual({ error: 'Not authenticated', status: 401 });
  });

  it('returns an error when the token is malformed', () => {
    const result = getUserIdFromRequest(makeRequest('Bearer not-a-real-token'));
    expect(result).toEqual({ error: 'Invalid or expired token', status: 401 });
  });

  it('returns an error when the header is not Bearer-prefixed', () => {
    const token = jwt.sign({ id: 'user-123', email: 'a@b.com' }, SECRET);
    const result = getUserIdFromRequest(makeRequest(token));
    expect(result).toEqual({ error: 'Not authenticated', status: 401 });
  });

  it('returns an error when the token is signed with a different secret', () => {
    const token = jwt.sign({ id: 'user-123', email: 'a@b.com' }, 'wrong-secret');
    const result = getUserIdFromRequest(makeRequest(`Bearer ${token}`));
    expect(result).toEqual({ error: 'Invalid or expired token', status: 401 });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- legacy-jwt`
Expected: tests fail with module-not-found.

- [ ] **Step 4: Implement the helper**

Create `apps/web/src/server/auth/legacy-jwt.ts`:

```ts
import jwt from 'jsonwebtoken';

export type LegacyAuthResult =
  | { userId: string; error?: never; status?: never }
  | { userId?: never; error: string; status: number };

export function getUserIdFromRequest(req: Request): LegacyAuthResult {
  const header = req.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return { error: 'Not authenticated', status: 401 };
  }
  const token = header.slice(7);
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  try {
    const decoded = jwt.verify(token, secret) as { id: string; email: string };
    return { userId: decoded.id };
  } catch {
    return { error: 'Invalid or expired token', status: 401 };
  }
}

export function signLegacyToken(payload: { id: string; email: string }): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not set');
  }
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- legacy-jwt`
Expected: all 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/auth apps/web/package.json package-lock.json
git commit -m "feat(web): add legacy JWT helper for Next.js Route Handlers"
```

---

### Task 4: Migrate `/auth/login`, `/auth/register`, `/auth/me` to Route Handlers

**Files:**
- Create: `apps/web/src/app/api/auth-legacy/login/route.ts`
- Create: `apps/web/src/app/api/auth-legacy/register/route.ts`
- Create: `apps/web/src/app/api/auth-legacy/me/route.ts`
- Create: `apps/web/src/app/api/auth-legacy/login/route.test.ts` (integration test)

- [ ] **Step 1: Write the integration test for login**

Create `apps/web/src/app/api/auth-legacy/login/route.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST } from './route';
import { prisma } from '@repo/database';
import { hash } from 'bcryptjs';

const TEST_EMAIL = 'auth-test@example.com';
const TEST_PASSWORD = 'password123';

beforeAll(async () => {
  process.env.AUTH_SECRET = 'test-secret-for-integration';
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.user.create({
    data: {
      email: TEST_EMAIL,
      name: 'Test User',
      passwordHash: await hash(TEST_PASSWORD, 12),
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
});

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth-legacy/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth-legacy/login', () => {
  it('returns a token for valid credentials', async () => {
    const res = await POST(makeRequest({ email: TEST_EMAIL, password: TEST_PASSWORD }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.user.email).toBe(TEST_EMAIL);
  });

  it('rejects wrong password', async () => {
    const res = await POST(makeRequest({ email: TEST_EMAIL, password: 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await POST(makeRequest({ email: 'nobody@example.com', password: 'x' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed body', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- api/auth-legacy/login`
Expected: fails with module-not-found.

- [ ] **Step 3: Implement the login route**

Create `apps/web/src/app/api/auth-legacy/login/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { compare } from 'bcryptjs';
import { prisma } from '@repo/database';
import { signLegacyToken } from '@/server/auth/legacy-jwt';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const valid = await compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const token = signLegacyToken({ id: user.id, email: user.email });
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email },
    token,
  });
}
```

- [ ] **Step 4: Verify the test passes**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- api/auth-legacy/login`
Expected: all 4 tests pass.

- [ ] **Step 5: Implement /register**

Create `apps/web/src/app/api/auth-legacy/register/route.ts`. Copy the body of `apps/api/src/routes/auth.ts`'s register handler but adapt to NextResponse. Use `@/server/auth/legacy-jwt`'s `signLegacyToken`. Validate with the same Zod schema (`name >= 2`, `email`, `password >= 8`). On success: create user, create default `Account`, create default `UserSettings`, return `{ user, token }` with status 201.

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { prisma } from '@repo/database';
import { signLegacyToken } from '@/server/auth/legacy-jwt';

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const { name, email, password } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }

  const passwordHash = await hash(password, 12);
  const user = await prisma.user.create({ data: { name, email, passwordHash } });
  await Promise.all([
    prisma.account.create({ data: { userId: user.id, name: 'Default Account', isDefault: true } }),
    prisma.userSettings.create({ data: { userId: user.id } }),
  ]);

  const token = signLegacyToken({ id: user.id, email: user.email });
  return NextResponse.json(
    { user: { id: user.id, name: user.name, email: user.email }, token },
    { status: 201 },
  );
}
```

- [ ] **Step 6: Implement /me**

Create `apps/web/src/app/api/auth-legacy/me/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';

export async function GET(request: Request) {
  const auth = getUserIdFromRequest(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  return NextResponse.json({ user });
}
```

- [ ] **Step 7: Update the frontend auth-context to point at the new paths**

Open `apps/web/src/lib/auth-context.tsx`. Find every `fetch('/auth/login'...)`, `fetch('/auth/register'...)`, `fetch('/auth/me'...)` and change to `/api/auth-legacy/login`, `/api/auth-legacy/register`, `/api/auth-legacy/me` respectively. The existing rewrite (`/api/:path*` → Express `/:path*`) means the old paths went via `/auth/login` directly — search the file for the exact strings to find.

Run: `grep -n "/auth/" apps/web/src/lib/auth-context.tsx`
Expected: at least three matches. Replace each.

- [ ] **Step 8: Manual smoke test**

Start Next.js dev server: `nvm use 20.20.1 && npm run dev --workspace=trading-journal`
In another terminal:

```bash
# Register
curl -X POST http://localhost:3000/api/auth-legacy/register \
  -H 'content-type: application/json' \
  -d '{"name":"Smoke Test","email":"smoke@example.com","password":"password123"}'
```

Expected: 201 + token in JSON. (If user already exists, expect 409 — pick a fresh email.)

```bash
# Login
curl -X POST http://localhost:3000/api/auth-legacy/login \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","password":"password123"}'
```

Expected: 200 + token.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/api/auth-legacy apps/web/src/lib/auth-context.tsx
git commit -m "feat(web): migrate /auth/* endpoints into Next.js Route Handlers"
```

---

### Task 5: Migrate `/trades` (list + create)

**Files:**
- Create: `apps/web/src/app/api/trades/route.ts`
- Create: `apps/web/src/app/api/trades/route.test.ts`

The Express handler at `apps/api/src/routes/trades.ts` is the source of truth. Translate each handler one-by-one. Reuse `getUserIdFromRequest` for auth. Use Prisma from `@repo/database`. Use validators from `@/server/lib/validators`.

- [ ] **Step 1: Read the Express source**

Run: `cat apps/api/src/routes/trades.ts | head -200`
Note the GET list query params (`search`, `side`, `status`, `accountId`, `from`, `to`, `page`, `limit`) and the response shape (`{ data, total, page, limit }` or similar — check the actual code).

- [ ] **Step 2: Write the integration test**

Create `apps/web/src/app/api/trades/route.test.ts`. Set up a test user with a known token, insert two trades, hit GET, assert both come back. Insert a third trade belonging to a different user, assert it does NOT come back.

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GET, POST } from './route';
import { prisma } from '@repo/database';
import { signLegacyToken } from '@/server/auth/legacy-jwt';

let userId: string;
let otherUserId: string;
let token: string;

beforeAll(async () => {
  process.env.AUTH_SECRET = 'test-secret';
  const u = await prisma.user.create({ data: { email: `trades-test-${Date.now()}@x.com`, passwordHash: 'x' } });
  const o = await prisma.user.create({ data: { email: `trades-other-${Date.now()}@x.com`, passwordHash: 'x' } });
  userId = u.id;
  otherUserId = o.id;
  token = signLegacyToken({ id: u.id, email: u.email });
  await prisma.trade.createMany({
    data: [
      { userId, symbol: 'AAPL', side: 'LONG', entryPrice: 100, quantity: 10, entryDate: new Date() },
      { userId, symbol: 'TSLA', side: 'LONG', entryPrice: 200, quantity: 5, entryDate: new Date() },
      { userId: otherUserId, symbol: 'NVDA', side: 'LONG', entryPrice: 500, quantity: 1, entryDate: new Date() },
    ],
  });
});

afterAll(async () => {
  await prisma.trade.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
});

function authedGet(url: string) {
  return new Request(url, { headers: { authorization: `Bearer ${token}` } });
}

describe('GET /api/trades', () => {
  it('returns only the calling user\'s trades', async () => {
    const res = await GET(authedGet('http://localhost/api/trades'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.data.map((t: any) => t.symbol).sort()).toEqual(['AAPL', 'TSLA']);
  });

  it('returns 401 with no token', async () => {
    const res = await GET(new Request('http://localhost/api/trades'));
    expect(res.status).toBe(401);
  });

  it('filters by side', async () => {
    const res = await GET(authedGet('http://localhost/api/trades?side=LONG'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
  });
});
```

- [ ] **Step 3: Run test, expect fail**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- api/trades`
Expected: fails with module-not-found.

- [ ] **Step 4: Implement the route**

Create `apps/web/src/app/api/trades/route.ts`. Port the Express handler logic. Key transformations:
- `req.userId!` → `auth.userId`
- `req.query` → `new URL(request.url).searchParams.get(...)`
- `res.json(x)` / `res.status(400).json(...)` → `NextResponse.json(x, { status: ... })`
- `req.body` → `await request.json()`

Use this skeleton:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';
import { tradeSchema } from '@/server/lib/validators';
import { calculateRMultiple } from '@/server/lib/calculations';

function formatTrade(t: any) {
  return {
    ...t,
    entryPrice: Number(t.entryPrice),
    exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
    quantity: Number(t.quantity),
    stopLoss: t.stopLoss ? Number(t.stopLoss) : null,
    takeProfit: t.takeProfit ? Number(t.takeProfit) : null,
    commission: Number(t.commission),
    pnl: t.pnl ? Number(t.pnl) : null,
    pnlPercent: t.pnlPercent ? Number(t.pnlPercent) : null,
    rMultiple: t.rMultiple ? Number(t.rMultiple) : null,
  };
}

export async function GET(request: Request) {
  const auth = getUserIdFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const search = url.searchParams.get('search');
  const side = url.searchParams.get('side');
  const status = url.searchParams.get('status');
  const accountId = url.searchParams.get('accountId');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  const hasRange = !!(from && to);
  const take = hasRange ? 1000 : limit;
  const skip = hasRange ? 0 : (page - 1) * limit;

  const where: any = { userId: auth.userId };
  if (search) where.symbol = { contains: search, mode: 'insensitive' };
  if (side && side !== 'ALL') where.side = side;
  if (status && status !== 'ALL') where.status = status;
  if (accountId && accountId !== 'ALL') where.accountId = accountId;
  if (hasRange) {
    const fromDate = new Date(from!);
    const toDate = new Date(to!);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
    }
    where.exitDate = { gte: fromDate, lte: toDate };
  }

  const [trades, total] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: hasRange ? { exitDate: 'asc' } : { entryDate: 'desc' },
      skip,
      take,
      include: { images: true },
    }),
    prisma.trade.count({ where }),
  ]);

  return NextResponse.json({
    data: trades.map(formatTrade),
    total,
    page,
    limit,
  });
}

export async function POST(request: Request) {
  const auth = getUserIdFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const parsed = tradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  // Port the rest of the Express POST handler here (createTrade, set rMultiple, etc.)
  // — copy from apps/api/src/routes/trades.ts's POST handler.
  // Use auth.userId in place of req.userId!.

  const trade = await prisma.trade.create({
    data: { ...parsed.data, userId: auth.userId },
    include: { images: true },
  });
  return NextResponse.json(formatTrade(trade), { status: 201 });
}
```

**Important:** Open `apps/api/src/routes/trades.ts` and copy the full POST handler body (including R-multiple calculation, tag handling, etc.) — the skeleton above is a starting point. Do NOT invent behavior.

- [ ] **Step 5: Run the test to verify it passes**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- api/trades`
Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/trades/route.ts apps/web/src/app/api/trades/route.test.ts
git commit -m "feat(web): migrate GET/POST /trades to Next.js Route Handler"
```

---

### Task 6: Migrate `/trades/[id]` (GET, PATCH, DELETE)

**Files:**
- Create: `apps/web/src/app/api/trades/[id]/route.ts`
- Create: `apps/web/src/app/api/trades/[id]/route.test.ts`

Follow the same TDD pattern as Task 5. Each handler:
1. Reads `params.id` from the second arg: `export async function GET(request: Request, { params }: { params: Promise<{ id: string }> })`
2. Authenticates with `getUserIdFromRequest`
3. Always includes `{ id, userId: auth.userId }` in the Prisma where-clause — never just `{ id }`
4. Returns 404 if not found (vs 403) so we don't leak existence to other users.

- [ ] **Step 1: Write the integration test**

Create `apps/web/src/app/api/trades/[id]/route.test.ts`. Set up a test user + a trade. Test:
- GET returns the trade for owner.
- GET returns 404 for non-owner.
- PATCH updates symbol, returns new value.
- PATCH 404 for non-owner.
- DELETE removes it; next GET returns 404.
- DELETE 404 for non-owner (and trade still exists in DB).

- [ ] **Step 2: Run test, expect fail**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- "api/trades/\[id\]"`

- [ ] **Step 3: Implement the route**

Port the Express PATCH/DELETE/GET-single handlers from `apps/api/src/routes/trades.ts`. Key snippet for each:

```ts
const trade = await prisma.trade.findFirst({ where: { id, userId: auth.userId } });
if (!trade) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```

- [ ] **Step 4: Run test, expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/trades/\[id\]
git commit -m "feat(web): migrate /trades/:id to Next.js Route Handler"
```

---

### Task 7: Migrate `/trades/import` (CSV)

**Files:**
- Create: `apps/web/src/app/api/trades/import/route.ts`
- Create: `apps/web/src/app/api/trades/import/route.test.ts`

The CSV import in `apps/api/src/routes/trades.ts` uses `express.json({ limit: '5mb' })` — the Next.js equivalent is handled by Next.js's built-in body parser (which has its own size limit). Check the existing import route for any size-specific logic.

- [ ] **Step 1: Inspect the Express import handler**

Run: `grep -n "import\|csv\|parseCsv" apps/api/src/routes/trades.ts | head -20`

Read the handler in full. Note: it accepts the raw CSV text (or a base64 payload — check) in the request body, calls `parseCsv` + `detectAdapter` + `getAdapter`, then upserts in batches of 500.

- [ ] **Step 2: Write the integration test**

Create `apps/web/src/app/api/trades/import/route.test.ts` with a small valid CSV string for one of the supported brokers (read `apps/web/src/server/lib/brokerAdapters/` to find one). Assert: POST returns `{ imported: N, skipped: M }`. Trades are visible via a follow-up `prisma.trade.findMany({ where: { userId } })`.

- [ ] **Step 3: Run test, expect fail**

- [ ] **Step 4: Port the handler**

Create `apps/web/src/app/api/trades/import/route.ts`. Use:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';
import { parseCsv } from '@/server/lib/csvParser';
import { detectAdapter, getAdapter } from '@/server/lib/brokerAdapters';

export const dynamic = 'force-dynamic';
// Next.js's default body size limit may be smaller than Express's 5mb.
// If imports of large CSVs were working in production, set this:
export const maxDuration = 60;
```

Next.js Route Handlers don't have a single config flag for body size as of the App Router; if the CSV exceeds ~1MB you may need to read the request as a stream. Check Next.js 16 docs at implementation time — note this in a code comment.

- [ ] **Step 5: Run test, expect pass**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/trades/import
git commit -m "feat(web): migrate /trades/import to Next.js Route Handler"
```

---

### Task 8: Migrate `/dashboard` (replacing the existing proxy)

**Files:**
- Modify: `apps/web/src/app/api/dashboard/route.ts` (the existing proxy file gets *replaced*)
- Create: `apps/web/src/app/api/dashboard/route.test.ts`

- [ ] **Step 1: Read the Express handler**

Run: `cat apps/api/src/routes/dashboard.ts`

- [ ] **Step 2: Write a basic integration test**

Asserts GET returns 200 with the expected shape for an authenticated user, 401 without a token.

- [ ] **Step 3: Replace the file**

Overwrite `apps/web/src/app/api/dashboard/route.ts` — port the Express logic, drop the `fetch(API_BASE)` proxy entirely.

- [ ] **Step 4: Run tests, expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/dashboard
git commit -m "feat(web): replace /dashboard proxy with direct Route Handler"
```

---

### Task 9: Migrate `/analytics`

**Files:**
- Create: `apps/web/src/app/api/analytics/route.ts`
- Create: `apps/web/src/app/api/analytics/route.test.ts`

Follow the same pattern. Read `apps/api/src/routes/analytics.ts`, port the GET handler. Analytics imports `analytics-helpers` which is already moved to `@/server/lib/analytics-helpers`.

- [ ] **Step 1: Write the integration test**

Create test asserting 200 for an authenticated user with at least one closed trade, asserting the response shape (winRate, sharpe, etc. — check the Express response).

- [ ] **Step 2: Run test, expect fail**

- [ ] **Step 3: Port the handler**

- [ ] **Step 4: Run test, expect pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/analytics
git commit -m "feat(web): migrate /analytics to Next.js Route Handler"
```

---

### Task 10: Migrate `/tags`

**Files:**
- Create: `apps/web/src/app/api/tags/route.ts` (GET list, POST create)
- Create: `apps/web/src/app/api/tags/[id]/route.ts` (PATCH, DELETE)
- Create: `apps/web/src/app/api/tags/route.test.ts`
- Create: `apps/web/src/app/api/tags/[id]/route.test.ts`

Read `apps/api/src/routes/tags.ts` and port each handler. Tests assert: GET returns only this user's tags, POST creates, PATCH updates name/color, DELETE removes.

- [ ] **Step 1: Write tests**

- [ ] **Step 2: Tests fail**

- [ ] **Step 3: Port handlers**

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/tags
git commit -m "feat(web): migrate /tags to Next.js Route Handlers"
```

---

### Task 11: Migrate `/journal`

**Files:**
- Create: `apps/web/src/app/api/journal/route.ts`
- Create: `apps/web/src/app/api/journal/[id]/route.ts`
- Create: tests for both.

Read `apps/api/src/routes/journal.ts`. Same pattern. JournalEntry has a `(userId, entryDate)` uniqueness constraint — the POST handler may upsert. Preserve that.

- [ ] **Step 1: Write tests**

- [ ] **Step 2: Tests fail**

- [ ] **Step 3: Port handlers**

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/journal
git commit -m "feat(web): migrate /journal to Next.js Route Handlers"
```

---

### Task 12: Migrate `/settings`

**Files:**
- Create: `apps/web/src/app/api/settings/route.ts` (GET, PATCH — likely an upsert)
- Create: `apps/web/src/app/api/settings/route.test.ts`

Read `apps/api/src/routes/settings.ts`. UserSettings has a 1:1 relationship with User. GET should auto-create defaults if missing (or return them) — match existing behavior.

- [ ] **Step 1: Write tests**

- [ ] **Step 2: Tests fail**

- [ ] **Step 3: Port handler**

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/settings
git commit -m "feat(web): migrate /settings to Next.js Route Handler"
```

---

### Task 13: Migrate `/accounts`

**Files:**
- Create: `apps/web/src/app/api/accounts/route.ts`
- Create: `apps/web/src/app/api/accounts/[id]/route.ts`
- Create: tests for both.

Read `apps/api/src/routes/accounts.ts`. Multiple accounts per user; one is `isDefault`. Switching default must clear other rows' `isDefault` in a transaction.

- [ ] **Step 1: Write tests** (including the "switching default" behavior)

- [ ] **Step 2: Tests fail**

- [ ] **Step 3: Port handlers**

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/accounts
git commit -m "feat(web): migrate /accounts to Next.js Route Handlers"
```

---

### Task 14: Update apiFetch + frontend callers

**Files:**
- Modify: `apps/web/src/lib/apiFetch.ts` (or wherever it lives — check Task 1's recon)
- Modify: any frontend file that calls `/auth/login`, `/auth/register`, `/auth/me` directly (auth-context was done in Task 4, but spot-check)

- [ ] **Step 1: Inventory all client-side fetch call sites**

Run: `grep -rn "apiFetch\|fetch('/auth\|fetch(\"/auth" apps/web/src --include='*.ts' --include='*.tsx'`
Expected: every match either uses `/api/...` (same-origin) or `/auth/...` (which would have hit Express via rewrite). Note any `/auth/...` matches.

- [ ] **Step 2: Confirm apiFetch base path**

Open `apps/web/src/lib/apiFetch.ts` (path may differ — find it from Step 1). Confirm callers pass relative paths starting with `/api/` or with `/auth/`. If callers use `/auth/...`, they need to switch to `/api/auth-legacy/...`. If callers use `/api/...`, they were already going through the Next.js rewrite to Express — those paths are unchanged for them but now hit Next.js Route Handlers directly (since the rewrite goes away in Task 15).

- [ ] **Step 3: Patch any callers using the bare `/auth/...` path**

Replace any `/auth/login`, `/auth/register`, `/auth/me` in frontend code with `/api/auth-legacy/login`, etc.

- [ ] **Step 4: Manual smoke test**

Start dev server with both api AND web (apps/api still serves as fallback during this transition until we remove the rewrite in Task 15). Log in, create a trade, view dashboard, view analytics, edit settings, edit a tag. Everything should still work — the rewrite is still active.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib apps/web/src/components apps/web/src/app
git commit -m "refactor(web): update frontend fetch call sites for migrated routes"
```

---

### Task 15: Remove the Next.js → Express rewrite

**Files:**
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Remove the rewrite**

Replace `apps/web/next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 2: Stop the apps/api dev process**

Make sure no `npm run dev --workspace=api` is running.

- [ ] **Step 3: Restart Next.js dev**

Run: `nvm use 20.20.1 && npm run dev --workspace=trading-journal`

- [ ] **Step 4: Manual full smoke test**

In the browser:
- Log in.
- View dashboard — assert metrics render.
- Open trades list — assert trades render with pagination working.
- Open analytics — assert charts render.
- Create a new trade — assert it appears in list.
- Edit a trade — assert it persists.
- Delete a trade — assert it's gone.
- View journal — assert it renders.
- Create a journal entry — assert it persists.
- View settings — assert values render.
- Save settings — assert PATCH succeeds.
- Create a tag — assert it appears.
- Apply tag to trade — assert it sticks.
- CSV import — try with a small known-good file.
- Log out — assert token is cleared and redirect to /login.

If anything fails, debug and fix before committing. **Do not skip this manual pass.**

- [ ] **Step 5: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "feat(web): remove /api/* rewrite — Next.js now serves API directly"
```

---

### Task 16: Delete apps/api and clean up render.yaml

**Files:**
- Delete: `apps/api/` (entire directory)
- Modify: `package.json` (root) — remove `apps/api` from workspaces.
- Modify: `render.yaml` — remove the API service block (or rename it to the web service if the web is currently deployed separately — verify before editing).
- Modify: `turbo.json` — remove any `apps/api`-specific config if present.

- [ ] **Step 1: Inventory remaining references**

Run: `grep -rln "apps/api\|trading-journal-api" --exclude-dir=node_modules --exclude-dir=.git`

Expected: refs in root `package.json`, `render.yaml`, possibly `turbo.json`, possibly `.github/workflows/*`.

- [ ] **Step 2: Verify nothing in apps/web imports from apps/api**

Run: `grep -rln "from ['\"]\.\.\/\.\.\/api\|from ['\"]\.\.\/\.\.\/\.\.\/api\|from ['\"]@repo\/api\|from ['\"]api\/" apps/web/src --include='*.ts' --include='*.tsx'`
Expected: zero matches.

- [ ] **Step 3: Delete the directory**

Run: `rm -rf apps/api`

- [ ] **Step 4: Update root package.json workspaces**

If `package.json` has `"workspaces": ["apps/*", "packages/*"]` it still works (the glob just won't match the deleted directory). If there's an explicit `apps/api` entry anywhere, remove it. Run: `nvm use 20.20.1 && npm install` to refresh the lockfile.

- [ ] **Step 5: Update render.yaml**

Open `render.yaml`. Currently the only service is `trading-journal-api`. We need to repoint Render at the Next.js web service. Replace the file with the Next.js deployment config:

```yaml
services:
  - type: web
    name: trading-journal-web
    env: node
    region: singapore
    plan: free
    buildCommand: npm install --include=dev && npx prisma generate --schema=packages/database/prisma/schema.prisma && npm run build --workspace=@repo/database && npm run build --workspace=trading-journal && npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
    startCommand: cd apps/web && npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
      - key: AUTH_SECRET
        sync: false
```

**Manual step the operator must do after deploying:** Render will treat this as a new service (different name). The operator needs to update the DNS/URL or rename the existing service in the Render dashboard. Document this in the commit body.

- [ ] **Step 6: Run all tests**

Run: `nvm use 20.20.1 && npm test`
Expected: all tests across all remaining workspaces pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove apps/api after Next.js consolidation

The Express API has been fully migrated to Next.js Route Handlers in
apps/web/src/app/api/. Render config now points at the Next.js web
service. After merging, manually update the Render service name/URL
to match the new web service."
```

---

## Self-Review

**Spec coverage check (Phase 1):**
- ✅ Move Express routes into Next.js: Tasks 4–13.
- ✅ Shared business logic to `apps/web/src/server/`: Task 2.
- ✅ `apiFetch()` drops cross-origin: Task 14.
- ✅ Remove Next.js rewrite: Task 15.
- ✅ Delete `apps/api`: Task 16.

**Placeholder scan:** No "TBD" remaining. The Task 7 note about Next.js 16 body size config is a deferred-to-implementation decision (Next.js docs at impl time), not a placeholder.

**Type consistency:** `getUserIdFromRequest` returns `{ userId }` (success) or `{ error, status }` (failure). Every Route Handler example consistently uses `if (auth.error) return ...; ... auth.userId`. ✓.

**Risk acknowledged:** Tasks 5–13 each ask the implementer to "port the Express handler" — the plan doesn't paste every line of every handler. This is by design: the source of truth is the existing Express code, which already works. Pasting it here would just duplicate it. The implementer reads the Express file, ports it. The integration test in each task verifies behavior parity.
