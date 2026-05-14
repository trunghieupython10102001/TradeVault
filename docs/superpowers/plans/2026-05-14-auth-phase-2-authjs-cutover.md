# Auth Phase 2: Auth.js Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled JWT/Bearer/localStorage auth with Auth.js v5 using the Prisma adapter, database sessions, and HttpOnly cookies. Enable Credentials (existing email/password), Google OAuth, GitHub OAuth, and Email (magic link via Resend) providers. Rename the trading-side `Account` model to `TradingAccount` to free up the name for Auth.js.

**Architecture:** Auth.js v5 lives at `apps/web/src/server/auth/`. Its route handler mounts at `/api/auth/[...nextauth]`. A single `auth()` helper replaces `getUserIdFromRequest()`. Two guard helpers (`requireUser`, `requireAdmin`) wrap `auth()` for use in Route Handlers. Session storage = database (Prisma `Session` table). Cookies are HttpOnly + SameSite=Lax + Secure. The legacy `/api/auth-legacy/*` handlers are deleted at the end of this phase.

**Tech Stack:** Auth.js v5 (`next-auth@5`), `@auth/prisma-adapter`, `resend`, Prisma, Next.js 16, vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-14-auth-roadmap-design.md` Phase 2.

**Pre-condition:** Phase 1 is merged. All API routes live in Next.js. `apps/api` is gone.

**End-state verification:** A user can sign in with email/password, with Google, with GitHub, and via magic link. All return a session cookie. Hitting any `/api/...` route works because of that cookie. No more localStorage tokens. Existing users (who had JWTs) are gracefully logged out once at cutover.

---

## File Map

### Schema migration
- Modify: `packages/database/prisma/schema.prisma` — rename `Account` → `TradingAccount`, add Auth.js tables (`Account`, `Session`, `VerificationToken`), add User fields (`role`, `emailVerified`, `image`, `mfaEnabled`, `totpSecret`, `mfaBackupCodes`).
- New migration: `packages/database/prisma/migrations/<timestamp>_authjs_cutover/migration.sql`.

### Auth.js config
- Create: `apps/web/src/server/auth/config.ts`
- Create: `apps/web/src/server/auth/index.ts` — exports `auth`, `signIn`, `signOut`, `handlers`.
- Create: `apps/web/src/server/auth/guard.ts` — `requireUser`, `requireAdmin`.
- Create: `apps/web/src/server/auth/guard.test.ts`
- Create: `apps/web/src/server/auth/scope.ts` — `userScope` helper.
- Create: `apps/web/src/server/auth/scope.test.ts`
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts` — Auth.js mount point.

### Frontend
- Modify: `apps/web/src/app/layout.tsx` — wrap with `SessionProvider`.
- Modify: `apps/web/src/lib/auth-context.tsx` — replace with thin shim over `useSession()` (or delete and switch consumers to `useSession` directly).
- Modify: `apps/web/src/components/auth/AuthGuard.tsx` — use `useSession()`.
- Modify: `apps/web/src/app/login/page.tsx` — switch to Auth.js `signIn()`.
- Modify: `apps/web/src/app/register/page.tsx` — keep Credentials registration flow but switch session creation to Auth.js.
- Modify: `apps/web/src/lib/apiFetch.ts` — drop the Bearer header logic (cookie sent automatically by browser).

### Route handler migration
- Each `apps/web/src/app/api/{trades,dashboard,analytics,tags,journal,settings,accounts}/route.ts` (and `[id]/route.ts`): replace `getUserIdFromRequest(request)` with `await requireUser()`.

### Deletions at end of phase
- `apps/web/src/app/api/auth-legacy/` (entire dir).
- `apps/web/src/server/auth/legacy-jwt.ts` + test.
- `apps/web/src/lib/auth-context.tsx` (if fully replaced — otherwise keep as the shim).

### Env / config
- Modify: `.env.example` — add Auth.js env vars (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM`).
- Modify: `render.yaml` — declare the new env vars.

---

### Task 1: Install Auth.js v5 + adapter + Resend

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Remove next-auth v4**

Run: `nvm use 20.20.1 && npm uninstall next-auth --workspace=trading-journal`

- [ ] **Step 2: Install Auth.js v5 + Prisma adapter + Resend SDK**

Run: `nvm use 20.20.1 && npm install next-auth@beta @auth/prisma-adapter resend --workspace=trading-journal`

(Auth.js v5 is published as `next-auth@beta` at time of writing; verify at impl time whether a stable major version exists and use that instead.)

- [ ] **Step 3: Verify**

Run: `grep '"next-auth"\|"@auth/prisma-adapter"\|"resend"' apps/web/package.json`
Expected: all three present, `next-auth` at v5 (^5.0.0 or beta tag).

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "chore(deps): install Auth.js v5, Prisma adapter, Resend"
```

---

### Task 2: Rename `Account` model → `TradingAccount` (schema change first, then codebase)

This is the highest-blast-radius schema change in the entire roadmap. We do it as one atomic commit: Prisma schema, migration SQL, and every code reference.

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_rename_account_to_trading_account/migration.sql`
- Modify: every file in `apps/web/` that references `prisma.account`, the `Account` type, `accountId`, etc.

- [ ] **Step 1: Inventory references**

Run: `grep -rln "prisma\.account\|model Account\|Account\b\|accountId" apps/web/src packages/database --include='*.ts' --include='*.tsx' --include='*.prisma' | sort -u`

Save the output. Every file in this list needs touching.

- [ ] **Step 2: Edit the Prisma schema**

In `packages/database/prisma/schema.prisma`:

1. Rename the `Account` model to `TradingAccount` and change `@@map("accounts")` to `@@map("trading_accounts")`.
2. In the `User` model, rename the relation field `accounts Account[]` to `tradingAccounts TradingAccount[]`.
3. In the `Trade` model, rename the relation field `account Account?` to `tradingAccount TradingAccount?`. Rename `accountId` to `tradingAccountId` (keep `@map("account_id")` as `@map("trading_account_id")`).

- [ ] **Step 3: Generate the migration**

Run: `nvm use 20.20.1 && npx prisma migrate dev --create-only --name rename_account_to_trading_account --schema=packages/database/prisma/schema.prisma`

This generates a migration file under `packages/database/prisma/migrations/`. Open it. Prisma will likely emit DROP/CREATE statements (data loss). **Edit the migration to use ALTER TABLE RENAME** instead. Replace the generated SQL with:

```sql
ALTER TABLE "accounts" RENAME TO "trading_accounts";
ALTER TABLE "trades" RENAME COLUMN "account_id" TO "trading_account_id";
-- Indexes and foreign key names are auto-updated by Postgres rename.
```

- [ ] **Step 4: Apply the migration locally**

Run: `nvm use 20.20.1 && npx prisma migrate dev --schema=packages/database/prisma/schema.prisma`
Expected: applies cleanly. Verify in psql: `\dt` shows `trading_accounts`, no `accounts`. `\d trades` shows `trading_account_id`.

- [ ] **Step 5: Update every code reference**

For every file in the inventory from Step 1:

- `prisma.account` → `prisma.tradingAccount`
- `Account` type / import → `TradingAccount`
- `.accountId` → `.tradingAccountId`
- `account:` (relation include) → `tradingAccount:`
- `account.` (object access on a Trade) → `tradingAccount.`
- API response field `accountId` → keep external name `accountId` for backward compat IF the frontend already shipped it that way. (Decision: rename in the API too — clients are in the same repo, we update them together.)

Frontend implications: search for `accountId` in `apps/web/src/components/`, `apps/web/src/app/`, especially trade forms and account selectors. Update prop names and form fields too.

- [ ] **Step 6: Regenerate Prisma client**

Run: `nvm use 20.20.1 && npx prisma generate --schema=packages/database/prisma/schema.prisma`

- [ ] **Step 7: Run all tests**

Run: `nvm use 20.20.1 && npm test`
Expected: all tests pass. If a test that uses `prisma.account.create(...)` was missed, fix it.

- [ ] **Step 8: Manual smoke test**

Run: `npm run dev`. Log in. View accounts page. Create a trading account. Assign a trade to it. Delete a trading account. Set a different default.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(db): rename Account → TradingAccount

Frees up the 'Account' model name for Auth.js's OAuth provider linkage
table. Includes Prisma schema rename, RENAME TABLE migration, and
all code references across apps/web."
```

---

### Task 3: Add Auth.js schema (User columns + Account/Session/VerificationToken tables)

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_authjs_schema/migration.sql`

- [ ] **Step 1: Add to the schema**

Append to `packages/database/prisma/schema.prisma`:

```prisma
enum Role {
  USER
  ADMIN
}
```

Update the `User` model:

```prisma
model User {
  id              String    @id @default(uuid())
  email           String    @unique
  emailVerified   DateTime? @map("email_verified")
  name            String?
  image           String?
  passwordHash    String?   @map("password_hash")  // now optional — OAuth users don't have one
  role            Role      @default(USER)
  mfaEnabled      Boolean   @default(false) @map("mfa_enabled")
  totpSecret      String?   @map("totp_secret")
  mfaBackupCodes  String[]  @default([]) @map("mfa_backup_codes")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  tradingAccounts TradingAccount[]
  trades          Trade[]
  tags            Tag[]
  journalEntries  JournalEntry[]
  settings        UserSettings?
  accounts        Account[]   // Auth.js OAuth providers
  sessions        Session[]

  @@map("users")
}

model Account {
  id                String  @id @default(uuid())
  userId            String  @map("user_id")
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user              User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("auth_accounts")
}

model Session {
  id           String   @id @default(uuid())
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id")
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}
```

**Note:** Auth.js's adapter expects the model name `Account` but we've kept the table name as `auth_accounts` (via `@@map`) to avoid colliding with the now-renamed `trading_accounts` table. Auth.js operates on Prisma models, not tables, so this is fine.

Also note: `passwordHash` becomes optional (OAuth-only users have no password). Migration must drop NOT NULL on the column.

- [ ] **Step 2: Generate the migration**

Run: `nvm use 20.20.1 && npx prisma migrate dev --create-only --name authjs_schema --schema=packages/database/prisma/schema.prisma`

Open the generated migration. It should include:
- `CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');`
- `ALTER TABLE "users" ADD COLUMN "email_verified" TIMESTAMP, ADD COLUMN "image" TEXT, ADD COLUMN "role" "Role" NOT NULL DEFAULT 'USER', ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "totp_secret" TEXT, ADD COLUMN "mfa_backup_codes" TEXT[] DEFAULT ARRAY[]::TEXT[];`
- `ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;`
- `CREATE TABLE "auth_accounts" (...);`
- `CREATE TABLE "sessions" (...);`
- `CREATE TABLE "verification_tokens" (...);`
- Indexes and FK constraints.

If Prisma's generated SQL doesn't include the `DROP NOT NULL`, add it manually.

- [ ] **Step 3: Apply locally**

Run: `nvm use 20.20.1 && npx prisma migrate dev --schema=packages/database/prisma/schema.prisma`

- [ ] **Step 4: Backfill existing users' emailVerified**

In the migration's same SQL file, append:

```sql
-- Treat all pre-Auth.js users as verified, so they aren't locked out by Phase 3's verification gate.
UPDATE "users" SET "email_verified" = NOW() WHERE "email_verified" IS NULL;
```

Reapply: `npx prisma migrate reset --schema=packages/database/prisma/schema.prisma` (LOCAL ONLY — destroys local DB). For production, this UPDATE runs as part of the same `prisma migrate deploy` step.

⚠️ **Operator note for production:** This migration is data-destructive in the sense that it sets `email_verified = NOW()` for existing users. This is intended per the spec. Verify the migration file before deploying.

- [ ] **Step 5: Run prisma generate**

Run: `nvm use 20.20.1 && npx prisma generate --schema=packages/database/prisma/schema.prisma`

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma
git commit -m "feat(db): add Auth.js schema + User columns for MFA/role

Adds Role enum, emailVerified/image/role/MFA columns on User, and the
auth_accounts, sessions, verification_tokens tables required by
@auth/prisma-adapter. Backfills email_verified=NOW() for all existing
users so they're not locked out by Phase 3's verification gate."
```

---

### Task 4: Build the Auth.js config

**Files:**
- Create: `apps/web/src/server/auth/config.ts`
- Create: `apps/web/src/server/auth/index.ts`

- [ ] **Step 1: Write the config**

Create `apps/web/src/server/auth/config.ts`:

```ts
import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import Resend from 'next-auth/providers/resend';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@repo/database';
import { compare } from 'bcryptjs';
import { z } from 'zod';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Do NOT set allowDangerousEmailAccountLinking — see spec "OAuth provider account linking".
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash) return null;
        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // TODO(mfa): if user.mfaEnabled && account?.provider === 'credentials',
      // redirect to /auth/mfa-challenge. Until MFA ships, allow through.
      return true;
    },
    async session({ session, user }) {
      // Database sessions: `user` is the full User row from Prisma.
      // Surface role and id on the session object for downstream guards.
      if (session.user) {
        session.user.id = user.id;
        (session.user as any).role = (user as any).role;
        (session.user as any).emailVerified = (user as any).emailVerified;
      }
      return session;
    },
  },
  events: {
    // TODO(audit): emit { type: 'SIGN_IN', userId: user.id, provider: account?.provider }
    async signIn({ user, account }) {},
    // TODO(audit): emit { type: 'SIGN_OUT', userId }
    async signOut(message) {},
    // TODO(audit): emit { type: 'USER_CREATED', userId: user.id }
    async createUser({ user }) {},
  },
};
```

- [ ] **Step 2: Write the entrypoint**

Create `apps/web/src/server/auth/index.ts`:

```ts
import NextAuth from 'next-auth';
import { authConfig } from './config';

export const { auth, signIn, signOut, handlers } = NextAuth(authConfig);
```

- [ ] **Step 3: Mount the route handler**

Create `apps/web/src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/server/auth';
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Augment the Session type**

Create `apps/web/src/types/next-auth.d.ts` to extend Auth.js's `Session.user` type:

```ts
import type { Role } from '@repo/database';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role: Role;
      emailVerified: Date | null;
    };
  }
}
```

- [ ] **Step 5: Verify compilation**

Run: `nvm use 20.20.1 && cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/auth apps/web/src/app/api/auth apps/web/src/types
git commit -m "feat(auth): wire Auth.js v5 with Credentials + Google + GitHub + Resend"
```

---

### Task 5: Build the guard helpers (TDD)

**Files:**
- Create: `apps/web/src/server/auth/guard.ts`
- Create: `apps/web/src/server/auth/guard.test.ts`
- Create: `apps/web/src/server/db/scope.ts`
- Create: `apps/web/src/server/db/scope.test.ts`

- [ ] **Step 1: Write the failing tests for guards**

Create `apps/web/src/server/auth/guard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/server/auth', () => ({
  auth: vi.fn(),
}));

import { auth } from '@/server/auth';
import { requireUser, requireAdmin, UnauthorizedError, ForbiddenError } from './guard';

describe('requireUser', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the session user when authenticated', async () => {
    (auth as any).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', role: 'USER', emailVerified: new Date() },
    });
    const u = await requireUser();
    expect(u.id).toBe('u1');
  });

  it('throws UnauthorizedError when not authenticated', async () => {
    (auth as any).mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('requireAdmin', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns the user when admin', async () => {
    (auth as any).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', role: 'ADMIN', emailVerified: new Date() },
    });
    const u = await requireAdmin();
    expect(u.role).toBe('ADMIN');
  });

  it('throws ForbiddenError when not admin', async () => {
    (auth as any).mockResolvedValue({
      user: { id: 'u1', email: 'a@b.com', role: 'USER', emailVerified: new Date() },
    });
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws UnauthorizedError when not authenticated', async () => {
    (auth as any).mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- guard`
Expected: module-not-found.

- [ ] **Step 3: Implement the guards**

Create `apps/web/src/server/auth/guard.ts`:

```ts
import { NextResponse } from 'next/server';
import { auth } from './index';

export class UnauthorizedError extends Error {
  constructor() { super('Not authenticated'); }
}
export class ForbiddenError extends Error {
  constructor() { super('Forbidden'); }
}

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: 'USER' | 'ADMIN';
  emailVerified: Date | null;
};

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  return session.user as SessionUser;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'ADMIN') throw new ForbiddenError();
  return user;
}

/**
 * Wrap a Route Handler so guard errors become standard 401/403 responses.
 * Usage: `export const GET = withAuth(async (req, ctx, user) => { ... })`.
 */
export function withAuth<T>(
  handler: (req: Request, ctx: T, user: SessionUser) => Promise<Response>,
): (req: Request, ctx: T) => Promise<Response> {
  return async (req, ctx) => {
    try {
      const user = await requireUser();
      return await handler(req, ctx, user);
    } catch (e) {
      if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      if (e instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      throw e;
    }
  };
}

export function withAdmin<T>(
  handler: (req: Request, ctx: T, user: SessionUser) => Promise<Response>,
): (req: Request, ctx: T) => Promise<Response> {
  return async (req, ctx) => {
    try {
      const user = await requireAdmin();
      return await handler(req, ctx, user);
    } catch (e) {
      if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      if (e instanceof ForbiddenError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      throw e;
    }
  };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- guard`
Expected: all 5 tests pass.

- [ ] **Step 5: Write tests for `userScope`**

Create `apps/web/src/server/db/scope.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { userScope } from './scope';

describe('userScope', () => {
  it('returns a where clause keyed by userId', () => {
    expect(userScope('u-123')).toEqual({ userId: 'u-123' });
  });

  it('merges with extra where conditions', () => {
    expect(userScope('u-123', { symbol: 'AAPL' })).toEqual({
      userId: 'u-123',
      symbol: 'AAPL',
    });
  });

  it('does not let extra conditions override userId', () => {
    expect(userScope('u-123', { userId: 'other' as any })).toEqual({
      userId: 'u-123',
    });
  });
});
```

- [ ] **Step 6: Run, expect fail**

- [ ] **Step 7: Implement userScope**

Create `apps/web/src/server/db/scope.ts`:

```ts
/**
 * Builds a Prisma where-clause pre-scoped to a userId.
 * Pass into prisma.*.findMany/findFirst/count/etc. as the `where` argument.
 *
 * Hard invariant: `userId` from this helper always wins over anything in `extra`.
 */
export function userScope<T extends object>(userId: string, extra: T = {} as T): T & { userId: string } {
  return { ...extra, userId };
}
```

- [ ] **Step 8: Tests pass**

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/server/auth/guard.ts apps/web/src/server/auth/guard.test.ts apps/web/src/server/db
git commit -m "feat(auth): add requireUser/requireAdmin/userScope guards"
```

---

### Task 6: Add a static scope-leak check (TDD)

This is the spec's "vitest-based static check that greps route handlers for raw Prisma calls without a `userScope` wrapper."

**Files:**
- Create: `apps/web/src/server/db/scope.spec.ts`

- [ ] **Step 1: Write the static check**

Create `apps/web/src/server/db/scope.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const API_DIR = join(__dirname, '..', '..', 'app', 'api');
const SAFE_PATTERN = /userScope\(|requireAdmin\(/;
const SUSPECT_PATTERN = /\bprisma\.\w+\.(findMany|findFirst|findUnique|update|updateMany|delete|deleteMany|count|aggregate|groupBy)\s*\(/;
const ALLOWLIST = new Set<string>([
  // The Auth.js mount point legitimately doesn't call prisma directly.
  'auth/[...nextauth]/route.ts',
  // Add file paths here ONLY with clear justification.
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (p.endsWith('route.ts')) out.push(p);
  }
  return out;
}

describe('scope-leak static check', () => {
  it('every route handler that touches prisma scopes by userId or uses requireAdmin', () => {
    const offenders: string[] = [];
    for (const file of walk(API_DIR)) {
      const rel = file.slice(API_DIR.length + 1);
      if (ALLOWLIST.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      if (SUSPECT_PATTERN.test(src) && !SAFE_PATTERN.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders, `These route handlers query prisma without userScope(...) or requireAdmin():\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- scope.spec`
Expected: It will likely FAIL right now — none of the Phase 1 route handlers use `userScope` yet. **That's intentional.** Task 7 fixes them. Mark this test as `it.todo(...)` temporarily by changing `it(` to `it.todo(`, commit the test, then un-todo it after Task 7 finishes.

Actually, simpler — finish this task by writing the test, then add the to-do, commit, and let Task 7 enable it.

Replace the `it(...)` with `it.todo('every route handler that touches prisma scopes by userId or uses requireAdmin');`

- [ ] **Step 3: Commit the todo**

```bash
git add apps/web/src/server/db/scope.spec.ts
git commit -m "test(auth): scaffolding for scope-leak static check (todo until Task 7)"
```

---

### Task 7: Migrate every Route Handler to `requireUser` + `userScope`

This is mechanical: for each `apps/web/src/app/api/<resource>/route.ts` (and `[id]/route.ts`), replace the `getUserIdFromRequest` call with `requireUser`, and replace `{ userId }` where-clauses with `userScope(user.id, ...)`.

**Files (every Route Handler from Phase 1 except `auth-legacy` and `auth/[...nextauth]`):**
- `apps/web/src/app/api/trades/route.ts`
- `apps/web/src/app/api/trades/[id]/route.ts`
- `apps/web/src/app/api/trades/import/route.ts`
- `apps/web/src/app/api/dashboard/route.ts`
- `apps/web/src/app/api/analytics/route.ts`
- `apps/web/src/app/api/tags/route.ts`
- `apps/web/src/app/api/tags/[id]/route.ts`
- `apps/web/src/app/api/journal/route.ts`
- `apps/web/src/app/api/journal/[id]/route.ts`
- `apps/web/src/app/api/settings/route.ts`
- `apps/web/src/app/api/accounts/route.ts` (now serving `TradingAccount`)
- `apps/web/src/app/api/accounts/[id]/route.ts`

- [ ] **Step 1: Template transformation**

For each file, apply:

Before:
```ts
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';

export async function GET(request: Request) {
  const auth = getUserIdFromRequest(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // ... uses auth.userId
  const where = { userId: auth.userId, ...others };
}
```

After:
```ts
import { withAuth } from '@/server/auth/guard';
import { userScope } from '@/server/db/scope';

export const GET = withAuth(async (request, _ctx, user) => {
  const where = userScope(user.id, { ...others });
  // ... uses user.id
});
```

For routes with `[id]` params:

```ts
export const GET = withAuth(async (request, { params }: { params: Promise<{ id: string }> }, user) => {
  const { id } = await params;
  // ...
});
```

- [ ] **Step 2: Walk every file and apply**

For each file in the list, edit and verify locally with `npx tsc --noEmit` after each.

- [ ] **Step 3: Update each route's integration test**

Each test currently uses `signLegacyToken` and sets an Authorization header. Replace with mocking `auth()` to return a session. Sample replacement for one test:

Before:
```ts
import { signLegacyToken } from '@/server/auth/legacy-jwt';
// ...
const token = signLegacyToken({ id: u.id, email: u.email });
function authedGet(url: string) {
  return new Request(url, { headers: { authorization: `Bearer ${token}` } });
}
```

After:
```ts
import { vi } from 'vitest';
vi.mock('@/server/auth', () => ({ auth: vi.fn() }));
import { auth } from '@/server/auth';
// In beforeEach:
(auth as any).mockResolvedValue({
  user: { id: u.id, email: u.email, role: 'USER', emailVerified: new Date() },
});
function get(url: string) { return new Request(url); }
```

- [ ] **Step 4: Run the full test suite**

Run: `nvm use 20.20.1 && npm test`
Expected: all integration tests pass.

- [ ] **Step 5: Un-todo the scope-leak static check**

In `apps/web/src/server/db/scope.spec.ts`, change `it.todo(...)` back to `it(...)`.

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- scope.spec`
Expected: passes — every route handler now uses `userScope` or `requireAdmin`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(auth): migrate all Route Handlers to requireUser + userScope"
```

---

### Task 8: Replace the frontend auth context

**Files:**
- Modify: `apps/web/src/app/providers.tsx` (or `layout.tsx`, wherever the AuthProvider is wrapped) — wrap with `SessionProvider`.
- Modify: `apps/web/src/components/auth/AuthGuard.tsx` — use `useSession()`.
- Modify: `apps/web/src/app/login/page.tsx` — call `signIn('credentials', ...)`, `signIn('google')`, etc.
- Modify: `apps/web/src/app/register/page.tsx` — call `/api/auth-legacy/register` (still exists in this task — Task 11 deletes it) to create the user, then call `signIn('credentials', ...)` to log them in.
- Modify: `apps/web/src/lib/auth-context.tsx` — option A: replace with a shim that wraps `useSession`; option B: delete and update callers. **Go with B** — fewer abstractions.
- Modify: `apps/web/src/lib/apiFetch.ts` — drop the Bearer header logic; keep the 401 → /login redirect.

- [ ] **Step 1: Add SessionProvider**

In `apps/web/src/app/providers.tsx` (create if it doesn't already exist):

```tsx
'use client';
import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { ToastProvider } from '@/components/...'; // existing providers

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>{children}</ToastProvider>
    </SessionProvider>
  );
}
```

Wrap `<Providers>` in `apps/web/src/app/layout.tsx`.

- [ ] **Step 2: Rewrite AuthGuard**

```tsx
'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);
  if (status === 'loading') return <div>Loading...</div>;
  if (!session) return null;
  return <>{children}</>;
}
```

- [ ] **Step 3: Rewrite the login page**

In `apps/web/src/app/login/page.tsx`, replace the existing form handler with:

```tsx
'use client';
import { signIn } from 'next-auth/react';
import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await signIn('credentials', { email, password, redirect: false });
    if (res?.error) setError('Invalid email or password');
    else window.location.href = '/dashboard';
  }

  async function magicLink() {
    const res = await signIn('resend', { email, redirect: false });
    if (res?.error) setError('Could not send magic link');
  }

  return (
    <form onSubmit={onSubmit}>
      {/* existing email/password inputs */}
      <button type="submit">Sign in</button>
      <button type="button" onClick={() => signIn('google')}>Sign in with Google</button>
      <button type="button" onClick={() => signIn('github')}>Sign in with GitHub</button>
      <button type="button" onClick={magicLink}>Email me a magic link</button>
      {error && <p>{error}</p>}
    </form>
  );
}
```

Preserve the existing CSS/markup wherever possible; only the handlers change.

- [ ] **Step 4: Update register page**

Register still POSTs to `/api/auth-legacy/register` (it does account creation + UserSettings + default TradingAccount in one call). After a 201 response, call `signIn('credentials', { email, password, redirect: false })` to create the Auth.js session, then redirect.

- [ ] **Step 5: Strip Bearer from apiFetch**

Open `apps/web/src/lib/apiFetch.ts`:

```ts
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  // Cookies are sent automatically — no Authorization header anymore.
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && typeof window !== 'undefined') {
    window.location.href = '/login';
  }
  return res;
}
```

- [ ] **Step 6: Remove auth-context**

Search for `useAuth\|AuthContext\|AuthProvider` in `apps/web/src`. Update each call site:
- `const { user } = useAuth()` → `const { data: session } = useSession(); const user = session?.user`
- `useAuth().logout()` → `signOut({ callbackUrl: '/login' })`
- `useAuth().login(...)` → call `signIn('credentials', ...)` directly

When no callers remain, delete `apps/web/src/lib/auth-context.tsx`.

- [ ] **Step 7: Manual smoke test**

`npm run dev`. Visit `/login`. Sign in with the existing test account (Credentials provider). Confirm redirect to dashboard. Open DevTools → Application → Cookies. Confirm `authjs.session-token` cookie is present, HttpOnly, Secure (in prod), SameSite=Lax. Confirm `localStorage.token` is no longer being set.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app apps/web/src/components apps/web/src/lib
git commit -m "feat(web): switch frontend to Auth.js SessionProvider + signIn"
```

---

### Task 9: Add OAuth provider env vars + Resend setup

**Files:**
- Modify: `.env.example`
- Modify: `apps/web/.env.example` (if separate)
- Modify: `render.yaml`

- [ ] **Step 1: Document the env vars**

Add to `.env.example`:

```
# Auth.js
AUTH_SECRET=replace-with-32-byte-random
AUTH_URL=http://localhost:3000

# OAuth — create apps at console.developers.google.com and github.com/settings/developers
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=

# Email — Resend (resend.com)
AUTH_RESEND_KEY=
AUTH_EMAIL_FROM=auth@yourdomain.com
```

- [ ] **Step 2: Declare in render.yaml**

In `render.yaml`'s envVars list, add (all `sync: false`):

```yaml
- key: AUTH_GOOGLE_ID
  sync: false
- key: AUTH_GOOGLE_SECRET
  sync: false
- key: AUTH_GITHUB_ID
  sync: false
- key: AUTH_GITHUB_SECRET
  sync: false
- key: AUTH_RESEND_KEY
  sync: false
- key: AUTH_EMAIL_FROM
  sync: false
- key: AUTH_URL
  sync: false
```

- [ ] **Step 3: Operator manual steps**

Document in the commit message body — the operator must:

1. Create a Google OAuth client at console.cloud.google.com. Authorized redirect URI: `https://<your-render-domain>/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for dev).
2. Create a GitHub OAuth app at github.com/settings/developers. Authorization callback URL: `https://<your-render-domain>/api/auth/callback/github`.
3. Create a Resend account, generate an API key, verify the sending domain.
4. Set every `AUTH_*` env var on Render.
5. Set the same vars in local `.env.local`.

- [ ] **Step 4: Test OAuth flows in staging**

Manual: deploy the branch to a staging Render service. Visit `/login`. Click "Sign in with Google" → expect Google consent screen → redirect back, signed in. Repeat for GitHub. Request a magic link → check inbox → click link → signed in.

If you don't have a staging service, do this in dev:
- Set `AUTH_URL=http://localhost:3000`
- Use the dev Google/GitHub OAuth apps (the same callback URL idea, just localhost).

- [ ] **Step 5: Commit**

```bash
git add .env.example render.yaml
git commit -m "chore(auth): document OAuth/Resend env vars

After merging, operator must create Google and GitHub OAuth apps,
sign up for Resend, and set all AUTH_* env vars on Render. See
commit body for the manual step list."
```

---

### Task 10: User-impact mitigation banner

**Files:**
- Modify: `apps/web/src/app/login/page.tsx` — add a one-time banner explaining the auth change.

- [ ] **Step 1: Add the banner**

```tsx
{/* near the top of the login form */}
<div style={{ padding: '12px', background: 'var(--bg-accent)', border: '1px solid var(--border)', marginBottom: '16px', fontSize: '14px' }}>
  We upgraded our login system. If you were signed in before, please sign in again — your password and data are unchanged.
</div>
```

The banner is informational only; no logic. Frontend bundle will eventually drop it.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/login/page.tsx
git commit -m "feat(auth): one-time login-page notice about Auth.js cutover"
```

---

### Task 11: Delete legacy JWT code

**Files:**
- Delete: `apps/web/src/app/api/auth-legacy/` (entire dir)
- Delete: `apps/web/src/server/auth/legacy-jwt.ts`
- Delete: `apps/web/src/server/auth/legacy-jwt.test.ts`

- [ ] **Step 1: Confirm no callers remain**

Run: `grep -rln "auth-legacy\|legacy-jwt\|signLegacyToken\|getUserIdFromRequest" apps/web/src --include='*.ts' --include='*.tsx'`
Expected: only `apps/web/src/app/register/page.tsx` (which still POSTs to `/api/auth-legacy/register` for user creation). Decision: inline the registration logic into a NEW Route Handler `apps/web/src/app/api/auth/register/route.ts` that does NOT use legacy JWT — just creates the user and returns 201. Then update the register page to call that and follow up with `signIn('credentials', ...)`.

- [ ] **Step 2: Create the replacement registration route**

`apps/web/src/app/api/auth/register/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { prisma } from '@repo/database';

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }
  const { name, email, password } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
  }
  const passwordHash = await hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, emailVerified: null },
  });
  await Promise.all([
    prisma.tradingAccount.create({ data: { userId: user.id, name: 'Default Account', isDefault: true } }),
    prisma.userSettings.create({ data: { userId: user.id } }),
  ]);
  return NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
}
```

Note: `emailVerified: null` — Phase 3 will gate behavior on this. For now nothing checks it.

- [ ] **Step 3: Update the register page**

Replace the call to `/api/auth-legacy/register` with `/api/auth/register`. After success, call `signIn('credentials', { email, password, redirect: false })` then redirect to `/dashboard`.

- [ ] **Step 4: Delete legacy code**

```bash
rm -rf apps/web/src/app/api/auth-legacy
rm apps/web/src/server/auth/legacy-jwt.ts apps/web/src/server/auth/legacy-jwt.test.ts
```

Also remove the `jsonwebtoken` dep if nothing else uses it:
Run: `grep -rln "jsonwebtoken" apps/web/src` — if empty, run: `nvm use 20.20.1 && npm uninstall jsonwebtoken @types/jsonwebtoken --workspace=trading-journal`

- [ ] **Step 5: Run the full test suite**

Run: `nvm use 20.20.1 && npm test`
Expected: passes.

- [ ] **Step 6: Manual end-to-end**

Register a new user → log in → log out → log in with Google → log out → log in with GitHub → log out → request magic link → click link → signed in. All four flows work.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(auth): delete legacy JWT code path

Auth.js fully owns authentication. /api/auth-legacy/* routes are
removed, the jsonwebtoken dependency is uninstalled, and the
signLegacyToken/getUserIdFromRequest helpers are gone."
```

---

## Self-Review

**Spec coverage check (Phase 2):**
- ✅ Install Auth.js v5 + adapter: Task 1.
- ✅ Rename `Account` → `TradingAccount`: Task 2.
- ✅ Auth.js schema + new User columns: Task 3.
- ✅ Auth.js config with all four providers: Task 4.
- ✅ Guard helpers + scope helper: Task 5.
- ✅ Static scope-leak check: Task 6.
- ✅ Migrate every Route Handler to guards: Task 7.
- ✅ Frontend SessionProvider + signIn: Task 8.
- ✅ Env vars + Resend setup: Task 9.
- ✅ User-impact banner: Task 10.
- ✅ Existing user emailVerified backfill: Task 3 Step 4.
- ✅ Delete legacy JWT: Task 11.

**Placeholder scan:** All TODO markers are intentional — `// TODO(mfa)` and `// TODO(audit)` come from the spec's "designed-for, not built" rule. No accidental "TBD" markers.

**Type consistency:** `SessionUser` shape from `guard.ts` matches the `next-auth.d.ts` augmentation. `requireUser` and `requireAdmin` both return `SessionUser`. ✓.

**Risk acknowledged:** Task 2 (the rename) is high-risk; the test suite running green after Step 7 is the safety net. Task 7 has the most file edits but is mechanical. Task 9's OAuth setup blocks staging verification until the operator does manual console steps.
