# Auth Phase 0: Pre-work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the hardcoded fallback JWT secret, consolidate `JWT_SECRET`/`NEXTAUTH_SECRET` into a single `AUTH_SECRET`, and rate-limit the existing `/auth/login` and `/auth/register` endpoints. Ships independently of the larger migration.

**Architecture:** Three small, focused commits. No schema changes. No new dependencies in `apps/web`. Adds `express-rate-limit` to `apps/api`. Fail-fast on missing env var. Per-IP and per-email rate limit keys to slow enumeration.

**Tech Stack:** Express 4, `express-rate-limit` (new), `jsonwebtoken`, Render env vars.

**Reference spec:** `docs/superpowers/specs/2026-05-14-auth-roadmap-design.md` Phase 0.

---

## File Map

- Modify: `apps/api/src/middleware/auth.ts` — read `AUTH_SECRET`, throw on missing, remove fallback.
- Modify: `apps/api/src/index.ts` — fail-fast assertion at boot.
- Modify: `apps/api/src/routes/auth.ts` — attach rate limiters.
- Create: `apps/api/src/middleware/rateLimit.ts` — login + register limiters.
- Create: `apps/api/src/middleware/rateLimit.test.ts` — unit tests.
- Modify: `apps/api/package.json` — add `express-rate-limit`.
- Modify: `render.yaml` — rename env var to `AUTH_SECRET`.
- Modify: `.env.example` (root and `apps/api/.env.example` if present) — document `AUTH_SECRET`.

---

### Task 1: Consolidate secret env var

**Files:**
- Modify: `apps/api/src/middleware/auth.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `render.yaml`
- Modify: `.env.example` (if present at repo root or `apps/api/`)

- [ ] **Step 1: Read current middleware to confirm baseline**

Run: `cat apps/api/src/middleware/auth.ts`
Expected: contains `const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fallback-dev-secret';`

- [ ] **Step 2: Replace the secret resolution with fail-fast**

Edit `apps/api/src/middleware/auth.ts`. Replace the line `const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fallback-dev-secret';` with:

```ts
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  throw new Error('AUTH_SECRET is not set. Refusing to start with a fallback secret.');
}
```

Then replace every `JWT_SECRET` reference in the file with `AUTH_SECRET`.

- [ ] **Step 3: Update the other place that reads the secret**

Run: `grep -n "NEXTAUTH_SECRET\|JWT_SECRET\|fallback-dev-secret" apps/api/src -r`
Expected output should include `apps/api/src/routes/auth.ts` (the `/auth/me` route inlines a secret read).
Replace any `process.env.NEXTAUTH_SECRET || 'fallback-dev-secret'` in those files with `process.env.AUTH_SECRET!` (we'll have asserted at boot — the `!` is safe).

- [ ] **Step 4: Add a boot-time assertion in the API entrypoint**

In `apps/api/src/index.ts`, immediately after `dotenv.config();`, add:

```ts
if (!process.env.AUTH_SECRET) {
  console.error('FATAL: AUTH_SECRET is not set.');
  process.exit(1);
}
```

- [ ] **Step 5: Update render.yaml**

In `render.yaml`, change the env var name from `JWT_SECRET` to `AUTH_SECRET`:

```yaml
- key: AUTH_SECRET
  sync: false
```

- [ ] **Step 6: Update or create .env.example**

If `apps/api/.env.example` exists, replace any `NEXTAUTH_SECRET=...` or `JWT_SECRET=...` line with `AUTH_SECRET=replace-with-a-32-byte-random-string`. If no `.env.example` exists at the API root, create one with:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trading_journal
AUTH_SECRET=replace-with-a-32-byte-random-string
FRONTEND_URL=http://localhost:3000
PORT=4000
```

- [ ] **Step 7: Verify the API still boots locally**

Run: `nvm use 20.20.1 && AUTH_SECRET=devsecret npm run dev --workspace=api`
Expected: server logs `Server is running at http://localhost:4000`. No fallback warning. Now try without the env var: `nvm use 20.20.1 && unset AUTH_SECRET && npm run dev --workspace=api` — expected: process exits with `FATAL: AUTH_SECRET is not set.`

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/index.ts apps/api/src/routes/auth.ts render.yaml .env.example apps/api/.env.example
git commit -m "fix(auth): consolidate JWT secret into AUTH_SECRET, fail-fast on missing"
```

(Skip the `.env.example` paths that don't exist.)

- [ ] **Step 9: Rotate the production secret**

This is a manual Render console step the operator must do. Document in the commit message body that after merging, the operator must:
1. In Render dashboard for the API service, set `AUTH_SECRET` to a freshly-generated 32-byte value: `openssl rand -base64 32`.
2. Remove the old `JWT_SECRET` env var from Render.
3. Note: this will invalidate all existing JWTs in localStorage — the operator and any beta users will be logged out once.

---

### Task 2: Add the rate-limit middleware (TDD)

**Files:**
- Create: `apps/api/src/middleware/rateLimit.ts`
- Create: `apps/api/src/middleware/rateLimit.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install express-rate-limit**

Run: `nvm use 20.20.1 && npm install express-rate-limit --workspace=api`
Expected: `express-rate-limit` appears in `apps/api/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/middleware/rateLimit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { loginIpLimiter, loginEmailLimiter, registerLimiter } from './rateLimit';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.post('/login', loginIpLimiter, loginEmailLimiter, (_req, res) => res.json({ ok: true }));
  app.post('/register', registerLimiter, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('loginIpLimiter', () => {
  it('allows 5 requests then 429s the 6th from the same IP', async () => {
    const app = makeApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/login')
        .set('X-Forwarded-For', '1.2.3.4')
        .send({ email: `user${i}@example.com`, password: 'x' });
      expect(res.status).toBe(200);
    }
    const res = await request(app)
      .post('/login')
      .set('X-Forwarded-For', '1.2.3.4')
      .send({ email: 'user6@example.com', password: 'x' });
    expect(res.status).toBe(429);
  });
});

describe('loginEmailLimiter', () => {
  it('limits attempts per email regardless of IP', async () => {
    const app = makeApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/login')
        .set('X-Forwarded-For', `9.9.9.${i + 1}`)
        .send({ email: 'victim@example.com', password: 'guess' });
      expect(res.status).toBe(200);
    }
    const res = await request(app)
      .post('/login')
      .set('X-Forwarded-For', '9.9.9.99')
      .send({ email: 'victim@example.com', password: 'guess' });
    expect(res.status).toBe(429);
  });
});

describe('registerLimiter', () => {
  it('allows 5 registrations per IP per window', async () => {
    const app = makeApp();
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/register')
        .set('X-Forwarded-For', '7.7.7.7')
        .send({ email: `n${i}@x.com`, password: 'x', name: 'x' });
      expect(res.status).toBe(200);
    }
    const res = await request(app)
      .post('/register')
      .set('X-Forwarded-For', '7.7.7.7')
      .send({ email: 'n6@x.com', password: 'x', name: 'x' });
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 3: Install supertest if missing**

Run: `nvm use 20.20.1 && npm install --save-dev supertest @types/supertest --workspace=api`

- [ ] **Step 4: Run the test to verify it fails**

Run: `nvm use 20.20.1 && npm test --workspace=api -- rateLimit`
Expected: tests fail with "Cannot find module './rateLimit'".

- [ ] **Step 5: Implement the rate limiters**

Create `apps/api/src/middleware/rateLimit.ts`:

```ts
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const loginIpLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this IP. Try again in 15 minutes.' },
  // express-rate-limit reads X-Forwarded-For by default when app.set('trust proxy', ...) is on,
  // but we set the key explicitly to keep tests deterministic.
  keyGenerator: (req: Request) => (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown',
});

export const loginEmailLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts for this email. Try again in 15 minutes.' },
  keyGenerator: (req: Request) => {
    const email = (req.body?.email as string | undefined)?.toLowerCase().trim();
    return email ? `email:${email}` : `ip:${req.ip}`;
  },
  skip: (req: Request) => !req.body?.email,
});

export const registerLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registrations from this IP. Try again in 15 minutes.' },
  keyGenerator: (req: Request) => (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown',
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `nvm use 20.20.1 && npm test --workspace=api -- rateLimit`
Expected: all 3 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/middleware/rateLimit.ts apps/api/src/middleware/rateLimit.test.ts apps/api/package.json apps/api/package-lock.json
git commit -m "feat(auth): add rate limiters for login and register"
```

(`package-lock.json` may be at repo root — adjust as needed. Run `git status` to confirm what got staged.)

---

### Task 3: Wire rate limiters into the auth routes

**Files:**
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/index.ts` (enable `trust proxy` so rate limit reads forwarded IPs correctly on Render).

- [ ] **Step 1: Enable trust proxy in Express**

In `apps/api/src/index.ts`, immediately after `const app = express();`, add:

```ts
// Render terminates TLS at a proxy; trust the first hop so req.ip and X-Forwarded-For work.
app.set('trust proxy', 1);
```

- [ ] **Step 2: Attach the rate limiters to login and register**

In `apps/api/src/routes/auth.ts`:

1. Add the import at the top:
```ts
import { loginIpLimiter, loginEmailLimiter, registerLimiter } from '../middleware/rateLimit';
```

2. Change the route declarations:
```ts
router.post('/register', registerLimiter, async (req: Request, res: Response) => {
  // ...existing body unchanged
});

router.post('/login', loginIpLimiter, loginEmailLimiter, async (req: Request, res: Response) => {
  // ...existing body unchanged
});
```

- [ ] **Step 3: Manual smoke test locally**

Run: `nvm use 20.20.1 && AUTH_SECRET=devsecret npm run dev --workspace=api`
In another terminal, hit the endpoint 6 times:

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:4000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"nope@example.com","password":"wrong"}'
done
```

Expected output: `401 401 401 401 401 429`.

- [ ] **Step 4: Verify no existing tests broke**

Run: `nvm use 20.20.1 && npm test`
Expected: all existing tests pass (Sharpe, calculations, csv parser, validators, analytics-helpers, rateLimit).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/index.ts
git commit -m "feat(auth): rate-limit /auth/login and /auth/register"
```

---

## Self-Review Notes

- All three tasks ship independently if needed (Task 1 alone is a real safety improvement).
- The `loginEmailLimiter`'s `skip` clause means a request with no email body bypasses the email key, but it still hits `loginIpLimiter` first (limiters are chained), so missing-email requests are still IP-rate-limited.
- The `trust proxy` setting matters in production. On localhost without a proxy, `req.ip` works without it; on Render, without it, every request looks like it's from the load balancer.
- Spec coverage check: Phase 0 has three items — env var consolidation (Task 1), fallback removal (Task 1 step 2), rate limiting (Tasks 2+3). Covered.
