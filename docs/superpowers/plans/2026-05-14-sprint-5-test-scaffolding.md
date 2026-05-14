# Sprint 5 — Test Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the test harness — RTL + jsdom for component tests, Playwright for end-to-end, GitHub Actions for CI — without adding new feature tests yet. After this plan, every subsequent Sprint 5 PR lands with CI gating.

**Architecture:** vitest is already wired in `apps/web` (currently running in node env). Add a jsdom path for component tests via a separate vitest config or environment hint. Add Playwright as a peer test runner with its own command. Add a single GitHub Actions workflow that runs lint → vitest → build → Playwright against a Postgres service container.

**Tech Stack:** vitest (existing), `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@playwright/test`, GitHub Actions, Postgres 16 service container.

**Reference spec:** `docs/superpowers/specs/2026-05-14-sprint-5-design.md` §Feature 4.

**Pre-condition:** None — this can land independently.

**End-state verification:** A throwaway test in `apps/web/src/components/__example__.test.tsx` that renders `<button>hi</button>` and asserts on its text **passes** under `npm test`. `npx playwright test` runs and reports zero specs (no Playwright tests yet — just the harness). `gh pr create` triggers the workflow and it goes green on a no-op PR.

---

## File Map

- Modify: `apps/web/vitest.config.ts` — add jsdom test environment routing and `setupFiles`.
- Create: `apps/web/src/test-setup.ts` — imports `@testing-library/jest-dom/vitest`.
- Modify: `apps/web/package.json` — devDependencies + scripts.
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/` directory (empty for now; Playwright needs the dir to exist).
- Create: `apps/web/e2e/.gitkeep`
- Create: `.github/workflows/test.yml`
- Modify: `.gitignore` (root) — add Playwright report dirs.

---

### Task 1: Install dependencies

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Install RTL + jsdom + Playwright**

Run:
```bash
nvm use 20.20.1 && npm install --save-dev \
  @testing-library/react@^16 \
  @testing-library/jest-dom@^6 \
  @testing-library/user-event@^14 \
  jsdom@^25 \
  @playwright/test@^1.49 \
  --workspace=trading-journal
```

- [ ] **Step 2: Verify**

Run: `grep '"@testing-library/react"\|"@playwright/test"\|"jsdom"' apps/web/package.json`
Expected: all four (`@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@playwright/test`) present.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "chore(deps): add RTL, jsdom, Playwright for component + e2e tests"
```

---

### Task 2: Configure vitest for jsdom component tests

**Files:**
- Modify: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test-setup.ts`

- [ ] **Step 1: Create the setup file**

Create `apps/web/src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Update vitest config**

Replace `apps/web/vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    // Default to jsdom so component tests work; node-only tests can opt out
    // with `// @vitest-environment node` at the top of the file.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/server/**'],
      reporter: ['text', 'html'],
    },
  },
});
```

Note: changing the default environment from `node` to `jsdom` is fine because the existing tests under `apps/web/src/server/lib/*.test.ts` are pure logic that works in either env. If any existing test breaks, add `// @vitest-environment node` as the first line of that test file.

- [ ] **Step 3: Run the full suite to make sure nothing broke**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal`
Expected: every existing test still passes.

- [ ] **Step 4: Write a throwaway component test as a sanity check**

Create `apps/web/src/components/__harness__.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('test harness', () => {
  it('renders and queries the DOM', () => {
    render(<button type="button">Hello</button>);
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run it**

Run: `nvm use 20.20.1 && npm test --workspace=trading-journal -- __harness__`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/src/test-setup.ts apps/web/src/components/__harness__.test.tsx
git commit -m "test: configure vitest jsdom env with RTL setup"
```

---

### Task 3: Add Playwright config

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/.gitkeep`
- Modify: `apps/web/package.json` — add e2e script.
- Modify: `.gitignore`

- [ ] **Step 1: Create the Playwright config**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 0 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
```

- [ ] **Step 2: Create the e2e directory placeholder**

Run:
```bash
mkdir -p apps/web/e2e
touch apps/web/e2e/.gitkeep
```

- [ ] **Step 3: Add an e2e script to package.json**

In `apps/web/package.json`, add to the `scripts` block:

```json
"e2e": "playwright test",
"e2e:install": "playwright install --with-deps chromium"
```

- [ ] **Step 4: Verify Playwright is installed and can list tests**

Run: `cd apps/web && nvm use 20.20.1 && npx playwright test --list`
Expected: `Total: 0 tests in 0 files` (we haven't written any yet — this only verifies the config parses).

- [ ] **Step 5: Update root .gitignore**

Add to `.gitignore`:

```
# Playwright
apps/web/playwright-report
apps/web/test-results
apps/web/.playwright
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/playwright.config.ts apps/web/e2e apps/web/package.json package-lock.json .gitignore
git commit -m "test(e2e): add Playwright config and harness"
```

---

### Task 4: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Create the workflows directory**

Run: `mkdir -p .github/workflows`

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/test.yml`:

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
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: trading_journal_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/trading_journal_test
      AUTH_SECRET: ci-secret-not-real
      AUTH_URL: http://localhost:3000
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20.20.1
          cache: npm

      - name: Install deps
        run: npm ci

      - name: Generate Prisma client
        run: npx prisma generate --schema=packages/database/prisma/schema.prisma

      - name: Apply migrations
        run: npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma

      - name: Lint
        run: npm run lint

      - name: Vitest
        run: npm test

      - name: Install Playwright browser
        run: npm run e2e:install --workspace=trading-journal

      - name: Build Next.js
        run: npm run build --workspace=trading-journal

      - name: Start Next.js
        run: |
          npm start --workspace=trading-journal &
          npx wait-on http://localhost:3000 --timeout 60000
        env:
          PORT: 3000

      - name: Playwright
        run: npm run e2e --workspace=trading-journal
        env:
          E2E_BASE_URL: http://localhost:3000

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: apps/web/playwright-report
          retention-days: 7
```

- [ ] **Step 3: Add wait-on as a dev dep**

The workflow uses `wait-on` to block until Next.js is ready. Install at the workspace root:

Run: `nvm use 20.20.1 && npm install --save-dev wait-on --workspace=trading-journal`

- [ ] **Step 4: Verify YAML is valid**

Run: `cat .github/workflows/test.yml | head -5`
Expected: `name: test` on the first line.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/test.yml apps/web/package.json package-lock.json
git commit -m "ci: GitHub Actions workflow for lint + vitest + Playwright"
```

- [ ] **Step 6: Push and verify the workflow runs**

Push the branch and open a PR (or push to main if working directly):

```bash
git push
```

Then watch the workflow at GitHub Actions. Expected: it goes green (vitest passes the existing tests + the harness sanity check; Playwright runs 0 specs and reports green).

If the workflow fails, debug in-place — the most likely failures are:
- Lint errors in new files (fix and recommit).
- `npx prisma migrate deploy` failing because there are no migrations yet (unlikely — Sprint 5 inherits whatever migrations have been merged).
- `npm start` not finding a built app — confirm the build step ran without error.

---

## Self-Review

**Spec coverage check (Feature 4 — Test Suite + CI):**
- ✅ vitest + jsdom + RTL setup: Tasks 1–2.
- ✅ Playwright config: Task 3.
- ✅ GitHub Actions workflow: Task 4.
- ⏭ Actual integration / RTL / e2e tests for Sprint 5 features: deferred to `2026-05-14-sprint-5-final-test-pass.md` (the fifth plan).

**Placeholder scan:** No "TBD". The harness test file is named `__harness__.test.tsx` so it's obviously a placeholder, and it's left in the codebase as an executable smoke test of the harness itself — that's a feature, not a bug. Delete or rename it in a later cleanup if desired.

**Type consistency:** N/A (no domain types defined here).
