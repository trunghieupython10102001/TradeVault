# Sprint 4 — Design Spec

> Date: 2026-05-12
> Scope: Light/dark mode, keyboard shortcuts + command palette, time-of-day heatmap, calendar mood overlay
> Source: `IMPROVEMENT_PLAN.md` items P2-U2, P2-U3, P2-D3, P2-D4

---

## 1. Light / Dark Mode Toggle (P2-U2)

### Goals
- Add a fully-supported light theme alongside the existing dark theme.
- Default to the OS preference (`prefers-color-scheme`); allow user override.
- Persist the user's choice across sessions on the local device.
- No flash of wrong theme on initial paint.

### Architecture

**Token override approach.** The existing dark theme already lives in CSS custom properties in `apps/web/src/app/globals.css` under `:root`. Add a `[data-theme="light"]` selector that overrides the same tokens. All components that already use `var(--*)` automatically theme — no component changes needed.

**Theme provider.** New file `apps/web/src/lib/theme.tsx` exports:
- `ThemeProvider` — wraps the dashboard layout; manages tri-state preference `'system' | 'light' | 'dark'`; writes to `localStorage["theme"]`; subscribes to `matchMedia('(prefers-color-scheme: dark)')` for the `system` mode; sets `document.documentElement.dataset.theme` to the resolved theme (`'light' | 'dark'`).
- `useTheme()` — hook returning `{ preference, resolved, setPreference }`.

**Pre-paint script.** Inline `<script>` in `app/layout.tsx` `<head>` reads `localStorage["theme"]` and sets `documentElement.dataset.theme` synchronously before React hydrates. Prevents FOUC.

### Light-theme token overrides

Add the following block to `globals.css` (mirror every dark token that needs a different light value):

| Token | Dark (existing) | Light (new) |
|---|---|---|
| `--bg-primary` | `#050816` | `#F8FAFC` |
| `--bg-secondary` | `#0a1020` | `#FFFFFF` |
| `--bg-tertiary` | `#10182d` | `#F1F5F9` |
| `--bg-card` | `rgba(12,18,35,0.78)` | `#FFFFFF` |
| `--bg-card-hover` | `rgba(20,29,51,0.92)` | `#F8FAFC` |
| `--bg-elevated` | `#16203a` | `#FFFFFF` |
| `--bg-input` | `rgba(7,12,24,0.94)` | `#FFFFFF` |
| `--bg-overlay` | `rgba(3,8,20,0.76)` | `rgba(15,23,42,0.45)` |
| `--bg-glass` | `rgba(255,255,255,0.04)` | `rgba(15,23,42,0.04)` |
| `--bg-glass-strong` | `rgba(255,255,255,0.08)` | `rgba(15,23,42,0.06)` |
| `--text-primary` | `#f5f7ff` | `#0F172A` |
| `--text-secondary` | `#a7b4d5` | `#475569` |
| `--text-tertiary` | `#7182ab` | `#64748B` |
| `--text-muted` | `#556582` | `#94A3B8` |
| `--text-inverse` | `#050816` | `#FFFFFF` |
| `--border-subtle` (all rgba/white borders) | rgba | `#E2E8F0` |
| `--border-strong` | rgba | `#CBD5E1` |
| `--green` | `#22c55e` | `#16A34A` |
| `--green-hover` | `#4ade80` | `#15803D` |
| `--green-bg` | `rgba(34,197,94,0.12)` | `rgba(22,163,74,0.10)` |
| `--green-border` | `rgba(34,197,94,0.25)` | `rgba(22,163,74,0.25)` |
| `--red` | `#f87171` | `#DC2626` |
| `--red-hover` | `#fc8181` | `#B91C1C` |
| `--red-bg` | `rgba(248,113,113,0.12)` | `rgba(220,38,38,0.10)` |
| `--red-border` | `rgba(248,113,113,0.25)` | `rgba(220,38,38,0.25)` |
| `--blue` | `#60a5fa` | `#2563EB` |
| `--blue-bg` | `rgba(96,165,250,0.12)` | `rgba(37,99,235,0.10)` |
| `--blue-border` | `rgba(96,165,250,0.25)` | `rgba(37,99,235,0.25)` |

All light values meet WCAG AA contrast (4.5:1) against their backgrounds.

### Toggle UX

- Location: sidebar footer, above the existing user info section.
- Style: three-segment pill, icon-only.
  - Segment 1: `Monitor` icon (Lucide) — System
  - Segment 2: `Sun` icon — Light
  - Segment 3: `Moon` icon — Dark
- Active segment has `--bg-elevated` background with accent border.
- Each segment has `aria-label` and `title` for screen readers and hover tooltips.
- Segment height ~28px; full pill width ~96px.

### Edge cases handled in implementation
- Recharts color references: confirm all chart components use `var(--*)`, not hardcoded hex. Fix any holdouts.
- Topbar gradient and any `box-shadow rgba(0,0,0,*)` values may need light-mode tuning.
- The `react-day-picker` calendar uses some default styles that may not theme — verify and override.

---

## 2. Keyboard Shortcuts + Command Palette (P2-U3)

### Goals
- Global single-letter shortcuts for the most common actions.
- A `⌘K` / `Ctrl+K` command palette as the discovery hub.
- A `?` cheatsheet modal so users can find shortcuts without docs.

### Architecture

**Shortcut manager** — `apps/web/src/lib/shortcuts.tsx`:
- Mounts a single `keydown` listener at `DashboardShell.tsx`.
- Skips when `document.activeElement` is `input`, `textarea`, or `[contenteditable]` (except for `⌘K`, which works everywhere).
- Exposes a `useShortcut(key, handler, deps?)` hook for page-local shortcuts (future-proof, not required for this sprint).

**Command palette** — `apps/web/src/components/CommandPalette.tsx`:
- Modal overlay opened by `⌘K` / `Ctrl+K`.
- Controlled input + filtered list + arrow/enter keyboard navigation.
- No third-party library (cmdk etc.); ~150 lines of custom code keeps bundle small and styling consistent.

**Cheatsheet** — `apps/web/src/components/ShortcutsCheatsheet.tsx`:
- Modal opened by `?`. Two-column table of `Key` / `Action`.

### Shortcut set

| Key | Action |
|---|---|
| `N` | Navigate to `/dashboard/trades/new` |
| `J` | Navigate to `/dashboard/journal` with new-entry composer focused |
| `?` | Open cheatsheet modal |
| `⌘K` / `Ctrl+K` | Open command palette |
| `Esc` | Close any open modal/palette |
| `↑` / `↓` | Navigate palette/cheatsheet rows |
| `Enter` | Activate selected palette row |

### Command palette contents

Grouped sections in this order:

1. **Navigation** (static): Dashboard, Trades, Analytics, Journal, Calendar, Settings.
2. **Actions** (static): "New trade", "New journal entry", "Toggle theme" (cycles system→light→dark→system), "Open shortcuts cheatsheet".
3. **Trades** (dynamic): fetched lazily on first palette open via `GET /trades?limit=200&page=1` (cached in palette state for the session). Display: `{symbol} · {entryDate as YYYY-MM-DD} · {P&L formatted}`. Fuzzy filter matches symbol and date string. Selecting jumps to `/dashboard/trades/{id}`.

Arrow keys cycle through all items across all groups. Section headers are non-selectable.

### Visual hints

- "New Trade" CTA button gets a small `<kbd>N</kbd>` badge on hover (already mounted; just CSS).
- Topbar shows a small `⌘K Search…` pill (clickable, opens palette). Tucks under the existing topbar layout.

---

## 3. Time-of-Day Heatmap (P2-D3)

### Goals
- Show trade performance across day-of-week × hour-of-day in one glance.
- Support two views: P&L (diverging) and Win rate (sequential).
- Surface "best/worst trading windows" insight that the existing hourly bar chart cannot.

### Backend

Extend `GET /analytics` (in `apps/api/src/routes/analytics.ts`) with a new field:

```ts
byDayHour: Array<{
  day: number;   // 0=Sun..6=Sat
  hour: number;  // 0..23
  trades: number;
  wins: number;
  pnl: number;
}>
```

Computed alongside the existing `byHour` map (near line 218). Only emit cells with `trades > 0` (sparse).

### Frontend

New component `<HeatmapCard>` on the Analytics page, placed directly below the existing 24-column hourly bar chart.

**Layout**
- 7 rows × 24 columns grid.
- Cell size: 36×24px (864px total width). Below 900px viewport, the grid scrolls horizontally inside the card.
- Row labels (left): `Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`.
- Column labels (top): `0`, `2`, `4`, … `22` (every 2nd hour to avoid crowding).
- View toggle (top-right of card): `P&L` (default) / `Win rate`.

**P&L view**
- Cell background: `var(--green)` if `pnl > 0`, `var(--red)` if `pnl < 0`.
- Opacity = `0.2 + 0.8 × (|cell pnl| / max |pnl| across all cells)`. Clamped to `[0.2, 1.0]`.
- Empty cells (no trades): `var(--bg-glass)`.

**Win-rate view**
- Cell background: `var(--green)` with opacity = `winRate` (range `0..1`).
- Cells with `trades < 3` get a dashed 1px border (`var(--border-subtle)`) to signal low-confidence sample.
- Empty cells: `var(--bg-glass)`.

**Tooltip**
- On hover: `{dayLabel} {hour}:00 — {trades} trades, {winRate}% win, {pnl formatted}`.
- Built with native CSS (`::after`) or the same tooltip pattern already used in the hourly bar chart.

**Empty state**
- If `byDayHour.length === 0`, render the standard "No trades yet" empty card.

---

## 4. Calendar Mood Overlay (P2-D4)

### Goals
- Show journal mood alongside P&L on the calendar at a glance.
- Allow switching to a "mood view" for studying mood patterns in isolation.

### Backend

No new endpoint. The existing `GET /journal` already returns every journal entry for the user (no date filter). The calendar fetches it in parallel with trades and indexes the entries by `entryDate` on the client. At realistic scale (one entry/day for a few years) the payload is small enough that fetching all is fine; revisit if it grows past ~10k entries.

### Frontend

Update `apps/web/src/app/dashboard/calendar/page.tsx`:

1. **Mood badge (always shown)**
   - Small 14×14px circle in the top-right corner of every cell that has a journal entry for that date.
   - Color by mood:
     | Mood | Color |
     |---|---|
     | GREAT | `#22c55e` |
     | GOOD | `#86efac` |
     | NEUTRAL | `#94a3b8` |
     | BAD | `#fbbf24` |
     | TERRIBLE | `#dc2626` |
   - `aria-label="Mood: GREAT"`. Tooltip on hover shows the label.

2. **View toggle (calendar header, top-right)**
   - Two segments: `P&L view` (default) / `Mood view`.
   - In **P&L view**: cell background uses P&L color (existing behavior).
   - In **Mood view**: cell background uses the mood color at 0.18 opacity for days with a journal entry; neutral gray for days without one. P&L number still shown.

3. **Click behavior**
   - Unchanged: clicking a day with a journal entry navigates to that journal entry.
   - Clicking an empty day preserves existing behavior (no functional change in this sprint).

---

## Out of Scope

The following are NOT part of this sprint:
- Per-user theme persistence on `UserSettings` table (still local-only).
- Accent color customization.
- Additional keyboard shortcuts beyond the set above (no `G→T` chord navigation, no `E` for edit, etc.).
- Heatmap with custom date range — uses the current period selector.
- Mood color customization in user settings.

---

## Implementation Order

Roughly independent — can be done in any order, but suggested sequence by impact:

1. Light/dark mode (touches every page; do first so other work is themed correctly).
2. Calendar mood overlay (smallest change, ships fast).
3. Time-of-day heatmap (one backend field + one new card).
4. Keyboard shortcuts + command palette (largest single change; ship last).

---

## Verification

For each feature:
- Light/dark: visually inspect every page in both themes; check Recharts components; verify no FOUC on hard reload; verify `prefers-color-scheme` default.
- Shortcuts: test `N`, `J`, `?`, `⌘K`, `Esc`; verify input-field skipping; verify palette filter + arrow nav + enter.
- Heatmap: verify both P&L and Win-rate views; verify empty state; verify tooltips; verify behavior with sparse data.
- Calendar mood: verify badge appears for journal-entry days; verify view toggle; verify P&L numbers still readable in mood view; verify mood color legend.
