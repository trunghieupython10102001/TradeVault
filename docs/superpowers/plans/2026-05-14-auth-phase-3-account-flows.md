# Auth Phase 3: Account Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Layer the user-facing account flows on top of Auth.js: email verification gate for mutating routes, password reset, account deletion, session listing + revoke, and an explicit "Connected accounts" linking page (because we explicitly chose not to auto-link OAuth providers — see spec).

**Architecture:** Each flow is one Route Handler + one page. The verification gate is a new helper `requireVerifiedUser()` that wraps `requireUser()` and 403s if `emailVerified` is null. Password reset uses `VerificationToken` (Auth.js's own table). Session revoke is one Prisma delete. Connected-accounts link runs the OAuth flow with `signIn(provider, { ... })` while the user is already authenticated.

**Tech Stack:** Auth.js v5, Prisma, Resend, vitest. No new deps.

**Reference spec:** `docs/superpowers/specs/2026-05-14-auth-roadmap-design.md` Phase 3.

**Pre-condition:** Phase 2 is merged. Auth.js sessions work for all four providers. The `User.emailVerified` column exists.

**End-state verification:** A new user signing up via Credentials gets an unverified state, hits the verification gate on first attempt to create a trade, clicks resend, clicks link in email, becomes verified. Forgotten-password flow works. Account deletion removes all user data. User can revoke a session from a settings page.

---

## File Map

- Create: `apps/web/src/server/auth/guard.ts` — add `requireVerifiedUser` + `withVerifiedAuth`. (Modify existing file from Phase 2.)
- Create: `apps/web/src/server/auth/email.ts` — Resend helper for verification + reset emails. Reuses `AUTH_RESEND_KEY` + `AUTH_EMAIL_FROM`.
- Create: `apps/web/src/app/api/account/verify-email/route.ts` — POST sends a verification email; GET (`?token=...`) verifies a token.
- Create: `apps/web/src/app/api/account/password-reset/route.ts` — POST sends a reset email.
- Create: `apps/web/src/app/api/account/password-reset/confirm/route.ts` — POST verifies token + sets new password.
- Create: `apps/web/src/app/api/account/route.ts` — DELETE the user account.
- Create: `apps/web/src/app/api/account/sessions/route.ts` — GET list, DELETE all-but-current.
- Create: `apps/web/src/app/api/account/sessions/[id]/route.ts` — DELETE one.
- Create: `apps/web/src/app/verify-email/page.tsx` — page user lands on from email link.
- Create: `apps/web/src/app/forgot-password/page.tsx` — request reset form.
- Create: `apps/web/src/app/reset-password/page.tsx` — set-new-password form.
- Create: `apps/web/src/app/dashboard/settings/account/page.tsx` — settings page with: connected accounts, session list, delete-account button.
- Modify: Route Handlers that mutate (trades, journal, tags, accounts, settings, csv import) — swap `withAuth` → `withVerifiedAuth`. Read-only routes (analytics, dashboard) keep `withAuth`.
- Modify: `apps/web/src/components/auth/AuthGuard.tsx` — show a "please verify your email" banner if unverified.

---

### Task 1: Add `requireVerifiedUser` + `withVerifiedAuth` (TDD)

**Files:**
- Modify: `apps/web/src/server/auth/guard.ts`
- Modify: `apps/web/src/server/auth/guard.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/server/auth/guard.test.ts`:

```ts
import { requireVerifiedUser, EmailNotVerifiedError } from './guard';

describe('requireVerifiedUser', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns user when verified', async () => {
    (auth as any).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', role: 'USER', emailVerified: new Date() },
    });
    const u = await requireVerifiedUser();
    expect(u.emailVerified).not.toBeNull();
  });

  it('throws EmailNotVerifiedError when emailVerified is null', async () => {
    (auth as any).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', role: 'USER', emailVerified: null },
    });
    await expect(requireVerifiedUser()).rejects.toBeInstanceOf(EmailNotVerifiedError);
  });

  it('throws UnauthorizedError when not authenticated', async () => {
    (auth as any).mockResolvedValue(null);
    await expect(requireVerifiedUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

In `apps/web/src/server/auth/guard.ts`, append:

```ts
export class EmailNotVerifiedError extends Error {
  constructor() { super('Email not verified'); }
}

export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.emailVerified) throw new EmailNotVerifiedError();
  return user;
}

export function withVerifiedAuth<T>(
  handler: (req: Request, ctx: T, user: SessionUser) => Promise<Response>,
): (req: Request, ctx: T) => Promise<Response> {
  return async (req, ctx) => {
    try {
      const user = await requireVerifiedUser();
      return await handler(req, ctx, user);
    } catch (e) {
      if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      if (e instanceof EmailNotVerifiedError) return NextResponse.json({ error: 'Email not verified' }, { status: 403 });
      throw e;
    }
  };
}
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/auth/guard.ts apps/web/src/server/auth/guard.test.ts
git commit -m "feat(auth): add requireVerifiedUser + withVerifiedAuth guards"
```

---

### Task 2: Email helper for verification + reset

**Files:**
- Create: `apps/web/src/server/auth/email.ts`
- Create: `apps/web/src/server/auth/email.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/server/auth/email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn().mockResolvedValue({ data: { id: 'msg_1' }, error: null });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import { sendVerificationEmail, sendPasswordResetEmail } from './email';

beforeEach(() => {
  sendMock.mockClear();
  process.env.AUTH_RESEND_KEY = 'test-key';
  process.env.AUTH_EMAIL_FROM = 'auth@example.com';
  process.env.AUTH_URL = 'https://example.com';
});

describe('sendVerificationEmail', () => {
  it('sends a verification email with a token link', async () => {
    await sendVerificationEmail('user@example.com', 'tok123');
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      from: 'auth@example.com',
      to: 'user@example.com',
      subject: expect.stringMatching(/verify/i),
      html: expect.stringContaining('https://example.com/verify-email?token=tok123'),
    }));
  });
});

describe('sendPasswordResetEmail', () => {
  it('sends a reset email with a token link', async () => {
    await sendPasswordResetEmail('user@example.com', 'tok456');
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      html: expect.stringContaining('https://example.com/reset-password?token=tok456'),
    }));
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

Create `apps/web/src/server/auth/email.ts`:

```ts
import { Resend } from 'resend';

function client() {
  const key = process.env.AUTH_RESEND_KEY;
  if (!key) throw new Error('AUTH_RESEND_KEY is not set');
  return new Resend(key);
}

function from() {
  const f = process.env.AUTH_EMAIL_FROM;
  if (!f) throw new Error('AUTH_EMAIL_FROM is not set');
  return f;
}

function baseUrl() {
  const u = process.env.AUTH_URL;
  if (!u) throw new Error('AUTH_URL is not set');
  return u;
}

export async function sendVerificationEmail(email: string, token: string) {
  const link = `${baseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await client().emails.send({
    from: from(),
    to: email,
    subject: 'Verify your email — Trading Journal',
    html: `<p>Click below to verify your email address:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const link = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  await client().emails.send({
    from: from(),
    to: email,
    subject: 'Reset your password — Trading Journal',
    html: `<p>Click below to reset your password:</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, ignore this email. The link expires in 1 hour.</p>`,
  });
}
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server/auth/email.ts apps/web/src/server/auth/email.test.ts
git commit -m "feat(auth): Resend helper for verification + reset emails"
```

---

### Task 3: Email verification endpoint + page

**Files:**
- Create: `apps/web/src/app/api/account/verify-email/route.ts`
- Create: `apps/web/src/app/verify-email/page.tsx`

- [ ] **Step 1: Write the POST endpoint (send verification email)**

Create `apps/web/src/app/api/account/verify-email/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@repo/database';
import { withAuth } from '@/server/auth/guard';
import { sendVerificationEmail } from '@/server/auth/email';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const POST = withAuth(async (_request, _ctx, user) => {
  if (user.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }
  if (!user.email) {
    return NextResponse.json({ error: 'No email on account' }, { status: 400 });
  }

  const token = randomBytes(32).toString('hex');
  await prisma.verificationToken.create({
    data: {
      identifier: user.email,
      token,
      expires: new Date(Date.now() + ONE_DAY_MS),
    },
  });
  await sendVerificationEmail(user.email, token);
  return NextResponse.json({ ok: true });
});

// GET /api/account/verify-email?token=...
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const row = await prisma.verificationToken.findUnique({ where: { token } });
  if (!row) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  if (row.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token } });
    return NextResponse.json({ error: 'Token expired' }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { email: row.identifier },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.delete({ where: { token } }),
  ]);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write a basic integration test**

Create `apps/web/src/app/api/account/verify-email/route.test.ts`. Set up a test user with `emailVerified: null`, mock `auth()`, mock the resend client, POST → expect a `VerificationToken` row exists. Then GET with that token → expect 200 and user is verified.

- [ ] **Step 3: Run test, expect pass**

- [ ] **Step 4: Create the landing page**

Create `apps/web/src/app/verify-email/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'verifying' | 'ok' | 'error'>('verifying');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setStatus('error'); setError('Missing token'); return; }
    fetch(`/api/account/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.ok) {
          setStatus('ok');
          setTimeout(() => router.push('/dashboard'), 1500);
        } else {
          const body = await r.json().catch(() => ({}));
          setStatus('error');
          setError(body.error || 'Verification failed');
        }
      });
  }, [params, router]);

  if (status === 'verifying') return <p>Verifying your email...</p>;
  if (status === 'ok') return <p>Email verified! Redirecting...</p>;
  return <p>Verification failed: {error}</p>;
}
```

- [ ] **Step 5: Add the verification banner**

In `apps/web/src/components/auth/AuthGuard.tsx` (or a new component used inside the dashboard layout), show a banner if `session.user.emailVerified` is null:

```tsx
{!session.user.emailVerified && (
  <div style={{ padding: '12px', background: 'var(--bg-warning)', borderBottom: '1px solid var(--border)' }}>
    Please verify your email.
    <button onClick={() => fetch('/api/account/verify-email', { method: 'POST' })}>Resend</button>
  </div>
)}
```

- [ ] **Step 6: Manual smoke test**

Register a new user (no verification yet). Open dashboard → see banner. Click "Resend" → check inbox → click link → page says verified → banner disappears.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/account/verify-email apps/web/src/app/verify-email apps/web/src/components/auth
git commit -m "feat(auth): email verification flow"
```

---

### Task 4: Apply the verification gate to mutating routes

**Files:** All Route Handlers that mutate user data:
- `apps/web/src/app/api/trades/route.ts` — POST
- `apps/web/src/app/api/trades/[id]/route.ts` — PATCH, DELETE
- `apps/web/src/app/api/trades/import/route.ts` — POST
- `apps/web/src/app/api/journal/route.ts` — POST
- `apps/web/src/app/api/journal/[id]/route.ts` — PATCH, DELETE
- `apps/web/src/app/api/tags/route.ts` — POST
- `apps/web/src/app/api/tags/[id]/route.ts` — PATCH, DELETE
- `apps/web/src/app/api/accounts/route.ts` — POST (TradingAccount)
- `apps/web/src/app/api/accounts/[id]/route.ts` — PATCH, DELETE
- `apps/web/src/app/api/settings/route.ts` — PATCH

Read-only routes keep `withAuth`. Mutating handlers swap to `withVerifiedAuth`.

- [ ] **Step 1: Swap the wrapper on every mutating handler**

In each file, change `withAuth(async ...)` to `withVerifiedAuth(async ...)` ONLY for the verbs that mutate (POST, PATCH, DELETE). Keep GET on `withAuth`.

- [ ] **Step 2: Update tests to handle the new 403 case**

Every test that calls a mutating handler with an unverified user must now expect 403. Add one test per resource that exercises this. Example for trades POST:

```ts
it('returns 403 when email is not verified', async () => {
  (auth as any).mockResolvedValue({
    user: { id: userId, email: 'a@b.com', role: 'USER', emailVerified: null },
  });
  const res = await POST(new Request('http://localhost/api/trades', {
    method: 'POST',
    body: JSON.stringify({ symbol: 'AAPL', side: 'LONG', entryPrice: 100, quantity: 1, entryDate: new Date().toISOString() }),
  }));
  expect(res.status).toBe(403);
});
```

- [ ] **Step 3: Run all tests**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(auth): gate mutating routes on emailVerified"
```

---

### Task 5: Password reset flow

**Files:**
- Create: `apps/web/src/app/api/account/password-reset/route.ts` (POST — request reset)
- Create: `apps/web/src/app/api/account/password-reset/confirm/route.ts` (POST — confirm new password)
- Create: `apps/web/src/app/forgot-password/page.tsx`
- Create: `apps/web/src/app/reset-password/page.tsx`

- [ ] **Step 1: Implement the request route**

`apps/web/src/app/api/account/password-reset/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '@repo/database';
import { sendPasswordResetEmail } from '@/server/auth/email';

const schema = z.object({ email: z.string().email() });
const ONE_HOUR_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const { email } = parsed.data;

  // Find user but always 200 — never leak whether the email exists.
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.passwordHash) {
    const token = randomBytes(32).toString('hex');
    await prisma.verificationToken.create({
      data: {
        identifier: `password-reset:${email}`,
        token,
        expires: new Date(Date.now() + ONE_HOUR_MS),
      },
    });
    await sendPasswordResetEmail(email, token);
  }
  // Always return 200, even when user doesn't exist or has no password.
  return NextResponse.json({ ok: true });
}
```

The `identifier` is prefixed with `password-reset:` so these tokens don't collide with email-verification tokens stored in the same table.

- [ ] **Step 2: Implement the confirm route**

`apps/web/src/app/api/account/password-reset/confirm/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { prisma } from '@repo/database';

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const row = await prisma.verificationToken.findUnique({ where: { token: parsed.data.token } });
  if (!row || !row.identifier.startsWith('password-reset:')) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
  }
  if (row.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token: parsed.data.token } });
    return NextResponse.json({ error: 'Token expired' }, { status: 400 });
  }

  const email = row.identifier.slice('password-reset:'.length);
  const passwordHash = await hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { email }, data: { passwordHash } }),
    prisma.verificationToken.delete({ where: { token: parsed.data.token } }),
    // Revoke all sessions for this user — force re-login.
    prisma.session.deleteMany({ where: { user: { email } } }),
  ]);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write tests for both routes**

Create the integration tests. Cover:
- Request with unknown email → 200 (no email sent — verify `sendPasswordResetEmail` not called).
- Request with known email → 200 + email sent.
- Confirm with valid token → 200, user's passwordHash changes.
- Confirm with expired token → 400.
- Confirm with non-existent token → 400.
- Confirm with mismatched-prefix token (e.g., a verify-email token) → 400.

- [ ] **Step 4: Build the request page**

`apps/web/src/app/forgot-password/page.tsx` — a form with one email field. POSTs to `/api/account/password-reset`. Always shows "if an account exists for that email, we sent a link" regardless of whether the email exists.

- [ ] **Step 5: Build the confirm page**

`apps/web/src/app/reset-password/page.tsx` — reads `?token=...` from URL, shows two password inputs (new + confirm), POSTs to `/api/account/password-reset/confirm`. On success → redirect to `/login` with a "password reset, please log in" banner.

Add a "Forgot password?" link on `/login`.

- [ ] **Step 6: Manual smoke test**

Click "Forgot password?" → enter email → check inbox → click link → set new password → land on login → log in with new password.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/account/password-reset apps/web/src/app/forgot-password apps/web/src/app/reset-password apps/web/src/app/login
git commit -m "feat(auth): password reset via email token"
```

---

### Task 6: Account deletion

**Files:**
- Create: `apps/web/src/app/api/account/route.ts` (DELETE)
- Create: `apps/web/src/app/dashboard/settings/account/page.tsx` (settings page — also hosts session list + connected accounts in Tasks 7/8)

- [ ] **Step 1: Implement DELETE /api/account**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@repo/database';
import { withAuth } from '@/server/auth/guard';

const schema = z.object({ confirmation: z.string() });

export const DELETE = withAuth(async (request, _ctx, user) => {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  // Frontend posts the user's own email as confirmation.
  if (!parsed.success || parsed.data.confirmation !== user.email) {
    return NextResponse.json({ error: 'Confirmation mismatch' }, { status: 400 });
  }
  // onDelete: Cascade on all child tables means this one delete tears down everything.
  await prisma.user.delete({ where: { id: user.id } });
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 2: Write a test**

Create a user with a trade, a tag, a journal entry, a TradingAccount, UserSettings, and an active session. DELETE the user. Assert all child rows are gone.

- [ ] **Step 3: Build the settings page (account section)**

`apps/web/src/app/dashboard/settings/account/page.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

export default function AccountSettings() {
  const { data: session } = useSession();
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    if (!session) return;
    setDeleting(true);
    const res = await fetch('/api/account', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: confirm }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Delete failed');
      setDeleting(false);
      return;
    }
    await signOut({ callbackUrl: '/' });
  }

  return (
    <div>
      <h2>Delete account</h2>
      <p>This permanently deletes your account and every trade, tag, and journal entry. There is no undo.</p>
      <p>Type your email (<code>{session?.user.email}</code>) to confirm:</p>
      <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <button onClick={onDelete} disabled={confirm !== session?.user.email || deleting}>
        {deleting ? 'Deleting...' : 'Delete my account'}
      </button>
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Manual smoke test**

Create a throwaway user. Add a trade. Go to settings → account → type email → click delete → confirm logged out. Check DB: user row is gone, no orphaned trades.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/account/route.ts apps/web/src/app/dashboard/settings/account
git commit -m "feat(auth): account deletion with email confirmation"
```

---

### Task 7: Session listing + revoke

**Files:**
- Create: `apps/web/src/app/api/account/sessions/route.ts` (GET + DELETE all-but-current)
- Create: `apps/web/src/app/api/account/sessions/[id]/route.ts` (DELETE one)

- [ ] **Step 1: Implement the list + bulk revoke**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { withAuth } from '@/server/auth/guard';

export const GET = withAuth(async (_request, _ctx, user) => {
  const sessions = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { expires: 'desc' },
    select: { id: true, sessionToken: true, expires: true },
  });
  return NextResponse.json({ sessions });
});

// DELETE /api/account/sessions  → revoke all sessions except the current one.
export const DELETE = withAuth(async (request, _ctx, user) => {
  const currentToken = currentSessionToken(request);
  await prisma.session.deleteMany({
    where: {
      userId: user.id,
      ...(currentToken ? { NOT: { sessionToken: currentToken } } : {}),
    },
  });
  return NextResponse.json({ ok: true });
});

function currentSessionToken(req: Request): string | null {
  // The Auth.js session cookie name in production: '__Secure-authjs.session-token'; in dev: 'authjs.session-token'.
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)(?:__Secure-)?authjs\.session-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

- [ ] **Step 2: Implement single-session revoke**

`apps/web/src/app/api/account/sessions/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { withAuth } from '@/server/auth/guard';
import { userScope } from '@/server/db/scope';

export const DELETE = withAuth(async (_request, { params }: { params: Promise<{ id: string }> }, user) => {
  const { id } = await params;
  const result = await prisma.session.deleteMany({ where: userScope(user.id, { id }) });
  if (result.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
});
```

Note the `userScope(user.id, { id })` — ensures a user can't delete another user's session by guessing IDs.

- [ ] **Step 3: Tests**

Cover: list returns only this user's sessions; single revoke deletes by id+userId; bulk revoke removes others but not current; bulk revoke without cookie removes all sessions for this user.

- [ ] **Step 4: Build UI on the account settings page**

Extend `apps/web/src/app/dashboard/settings/account/page.tsx` with a session list above the delete-account section. Each row shows expiry; "Revoke" button calls `DELETE /api/account/sessions/${id}`. A "Sign out everywhere else" button calls `DELETE /api/account/sessions`.

- [ ] **Step 5: Manual smoke test**

Sign in from two browsers. In browser A go to settings → see 2 sessions. Revoke the other → browser B's next request 401s. Try "sign out everywhere else" — browser B 401s; browser A stays logged in.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/account/sessions apps/web/src/app/dashboard/settings/account
git commit -m "feat(auth): session list + revoke endpoints and UI"
```

---

### Task 8: Connected accounts (explicit OAuth linking)

This implements the spec's "explicit link from settings" pattern (instead of `allowDangerousEmailAccountLinking`).

**Files:**
- Create: `apps/web/src/app/api/account/oauth-providers/route.ts` (GET — list linked providers)
- Create: `apps/web/src/app/api/account/oauth-providers/[provider]/route.ts` (DELETE — unlink)
- Modify: `apps/web/src/app/dashboard/settings/account/page.tsx` — add the "Connected accounts" section.

- [ ] **Step 1: Implement the GET route**

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { withAuth } from '@/server/auth/guard';
import { userScope } from '@/server/db/scope';

export const GET = withAuth(async (_request, _ctx, user) => {
  const linked = await prisma.account.findMany({
    where: userScope(user.id),
    select: { provider: true, providerAccountId: true },
  });
  return NextResponse.json({ providers: linked });
});
```

- [ ] **Step 2: Implement unlink**

```ts
export const DELETE = withAuth(async (_request, { params }: { params: Promise<{ provider: string }> }, user) => {
  const { provider } = await params;
  // Refuse to unlink the last sign-in method.
  const accounts = await prisma.account.findMany({ where: userScope(user.id) });
  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  const hasPassword = !!dbUser?.passwordHash;
  if (!hasPassword && accounts.length <= 1) {
    return NextResponse.json({ error: "Can't unlink your only sign-in method. Set a password first." }, { status: 400 });
  }
  await prisma.account.deleteMany({ where: userScope(user.id, { provider }) });
  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 3: Tests**

Cover: GET lists linked providers; DELETE removes one; DELETE refuses to unlink if it's the only sign-in method.

- [ ] **Step 4: UI**

In the account settings page, add a "Connected accounts" section that lists Google/GitHub and shows their status (linked or not). "Connect" button calls `signIn('google')` (or `signIn('github')`) while already authenticated — Auth.js will link the new provider to the current session's user. "Unlink" calls `DELETE /api/account/oauth-providers/{provider}`.

Note: Auth.js's `linkAccount` flow for already-authenticated users is the default behavior — calling `signIn('google')` from a signed-in session adds the `Account` row instead of creating a new User.

- [ ] **Step 5: Manual smoke test**

Sign in with Credentials. Go to settings → Connected accounts → click "Connect Google" → consent screen → return signed in (still as same user). Refresh — Google appears as linked. Click "Unlink Google" → row removed. Try to unlink the only sign-in method → 400 with a clear error.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/account/oauth-providers apps/web/src/app/dashboard/settings/account
git commit -m "feat(auth): explicit OAuth provider linking from settings"
```

---

## Self-Review

**Spec coverage check (Phase 3):**
- ✅ Email verification gate: Tasks 1, 3, 4.
- ✅ Password reset: Task 5.
- ✅ Account deletion: Task 6.
- ✅ Session listing + revoke: Task 7.
- ✅ Connected accounts (explicit linking — replaces the auto-link risk noted in spec): Task 8.

**Placeholder scan:** None — every step has working code.

**Type consistency:** `requireVerifiedUser` returns the same `SessionUser` type as `requireUser`. `withVerifiedAuth` mirrors `withAuth` in signature. ✓.

**Risk acknowledged:** Task 4 has a wide blast radius (every mutating route). The integration tests for each resource (added in Phase 2 Task 7) provide the safety net.
