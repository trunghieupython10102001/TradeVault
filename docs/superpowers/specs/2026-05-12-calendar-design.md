# Calendar Enhancements — Design Spec

> Date: 2026-05-12
> Scope: Drill-down + correctness for the trading calendar
> Source: brainstorming session on improving the existing `/dashboard/calendar`

---

## Goals

1. Fix the data loading bug so the calendar reflects all closed trades for the visible month.
2. Add a day drawer that turns the calendar into the primary daily-review surface (click a day → see trades + journal entry, jump from there).
3. Add a weekly subtotal column.
4. Add a "Today" button and a today-cell indicator.
5. Expand month stats to include best/worst day and a vs-previous-month delta.
6. Theme-friendly mood colors (work in both light and dark).
7. Keyboard navigation: `←`, `→`, `T`, `Esc`.

## Sprint 4 Relationship

This spec is independent of Sprint 4 and can ship before, after, or in parallel. The mood-color tokens (section 2) add a `:root` block and a `[data-theme="light"]` block; if Sprint 4 hasn't shipped, the `[data-theme="light"]` block is a no-op at runtime (no element will ever have `data-theme="light"` set) but the structural change still cleans up the hardcoded hex. If Sprint 4 ships first, calendar gains light-mode mood colors automatically.

## Non-Goals (explicitly deferred)

- Year heatmap / multi-month view
- Account / tag / strategy filters on the calendar
- Drag-to-select date range
- Export of the calendar
- Future-day target / planning

---

## 1. Backend: `GET /trades` Date-Range Support

### Problem

`apps/web/src/app/dashboard/calendar/page.tsx` (line ~81) passes `startDate` / `endDate` to `GET /trades`. The backend (`apps/api/src/routes/trades.ts` line ~29) does **not** destructure or apply those params. The query also defaults to `limit=50`, so users with more than 50 closed trades see an incomplete calendar.

### Fix

In `apps/api/src/routes/trades.ts`:

1. Destructure `from` and `to` from `req.query` (use these names rather than `startDate` / `endDate`, which read as "trade entry started before X" — ambiguous).
2. When `from` and `to` are both present:
   - Validate both parse as ISO dates; return `400` with a clear error if not.
   - Add to `where`: `exitDate: { gte: new Date(from), lte: new Date(to) }`.
   - Skip pagination: `take: 1000`, `skip: 0`. (Cap at 1000 as a defensive bound.)
3. When only one of `from` / `to` is supplied, treat as missing — fall back to paginated behavior. Document this in a one-line comment.
4. Response shape unchanged. For range queries, `meta.total = data.length`, `meta.totalPages = 1`, `meta.page = 1`.

`exitDate` is the right field because P&L is realized on close — the calendar groups by closed-date. Open trades (status `OPEN`) have `exitDate = null` and won't match either way.

### Frontend update

`apps/web/src/app/dashboard/calendar/page.tsx`:
- Rename query param keys to `from` / `to`.
- Remove the client-side journal filter (line ~97-100); the journal endpoint already returns all entries, and indexing by date covers the visible range cheaply.

---

## 2. Mood Color Tokens

### Problem

`MOODS` map in `calendar/page.tsx` hardcodes hex values (`#22c55e`, `#60a5fa`, etc.). These don't theme. In light mode (Sprint 4), the high-saturation neon values will look harsh against white.

### Fix

Add CSS variables in `apps/web/src/app/globals.css`:

```css
:root {
  --mood-great: #22c55e;
  --mood-great-bg: rgba(34, 197, 94, 0.18);
  --mood-good: #60a5fa;
  --mood-good-bg: rgba(96, 165, 250, 0.18);
  --mood-neutral: #94a3b8;
  --mood-neutral-bg: rgba(148, 163, 184, 0.16);
  --mood-bad: #fb923c;
  --mood-bad-bg: rgba(251, 146, 60, 0.18);
  --mood-terrible: #f87171;
  --mood-terrible-bg: rgba(248, 113, 113, 0.18);
}

[data-theme="light"] {
  --mood-great: #16a34a;     --mood-great-bg: rgba(22, 163, 74, 0.14);
  --mood-good: #2563eb;      --mood-good-bg: rgba(37, 99, 235, 0.12);
  --mood-neutral: #64748b;   --mood-neutral-bg: rgba(100, 116, 139, 0.12);
  --mood-bad: #ea580c;       --mood-bad-bg: rgba(234, 88, 12, 0.12);
  --mood-terrible: #dc2626;  --mood-terrible-bg: rgba(220, 38, 38, 0.12);
}
```

Replace the `MOODS` const in `calendar/page.tsx` so each entry's `color` and `background` reference `var(--mood-*)`. Emoji and `label` stay the same. The same `MOODS` map can be reused on `/dashboard/journal` (which currently has its own `moodIcons`); deduplicate by moving the map to a shared file `apps/web/src/lib/moods.ts`.

---

## 3. Calendar Grid: 8th "Week" Column

### Layout

The current `.grid` is 7-column. Change to 8 columns: `Sun Mon Tue Wed Thu Fri Sat | Week`.

- Day columns: roughly equal width.
- Week column: narrower (~60px on desktop). On mobile (< 640px), the Week column drops to 44px wide or stacks below each week as a thin strip (mobile-only treatment — see Mobile section below).

### Week cell contents

For each week row:
- **Top line**: weekly P&L. Colored green/red. Format: `+$420` or `-$80`. If `0`, show `$0`.
- **Bottom line**: trade count, e.g., `5 trades`. If `0`, show `—`.

A week's data is the sum of P&Ls and trade counts across the 7 day cells in that row.

### Header

The day-of-week header row gets an 8th cell labeled `Week`.

### Loading state

While `loading`, week cells show `—` like day cells.

---

## 4. Day Drawer

### Trigger and dismiss

- Click a day cell where `pnl !== null || mood != null`.
- Cells with no trades AND no journal entry: clicking opens a "create journal entry" CTA on the same drawer (a single button).
- Future date cells: not clickable (`pointer-events: none`, opacity 0.4).
- Dismiss: backdrop click, `Esc`, or close button.

### Layout

Right-side drawer, slides in. Width: `min(440px, 92vw)`.

```
┌─────────────────────────────────────┐
│ Tuesday, May 5, 2026          [×]   │
├─────────────────────────────────────┤
│ ┌─────┐ ┌─────────┐ ┌─────────────┐ │
│ │ P&L │ │ Trades  │ │ Best/Worst  │ │
│ │+$420│ │ 4 · 75% │ │ +$280/-$60  │ │
│ └─────┘ └─────────┘ └─────────────┘ │
├─────────────────────────────────────┤
│ Trades                              │
│ ▸ EURUSD · L · entry→exit · +$280  │
│ ▸ GBPUSD · S · entry→exit · -$60   │
│ ▸ XAUUSD · L · entry→exit · +$200  │
│ ▸ NQ     · S · entry→exit · $0     │
├─────────────────────────────────────┤
│ Journal                  [Edit ›]   │
│ Mood: 🚀 Great                      │
│ "Good session. Held EURUSD long..." │
└─────────────────────────────────────┘
```

If no journal entry exists for the date:
```
│ Journal                             │
│ No entry yet.                       │
│   [Create entry for May 5]          │
└─────────────────────────────────────┘
```

### Data flow

The drawer receives props from the calendar page:
```ts
interface DayDrawerProps {
  date: Date;
  trades: Trade[];         // already filtered to this date
  journal: JournalEntry | null;
  onClose: () => void;
}
```

No extra API call. Calendar already fetches all trades + entries for the month.

### Stat card details

- **P&L card**: sum of `(pnl - commission)` across the day's trades. Colored.
- **Trades card**: `{n trades}` + win rate as `{wins}W / {losses}L` (excluding `pnl === 0`).
- **Best/Worst card**: max single-trade P&L (green) over min single-trade P&L (red). Slash-separated. If only winners, show `—` for worst, and vice versa.

### Trade row format

Single line per trade:
- Side badge: `L` (long, green bg) or `S` (short, red bg). 16×16 with 1-letter.
- Symbol (bold, monospace).
- Entry price → exit price (small, secondary text).
- Quantity, small.
- P&L on the right (colored, bold).
- Optional R-multiple chip if `rMultiple != null` (e.g., `+1.5R`).

Click anywhere on the row → `router.push('/dashboard/trades/{id}')` and close drawer.

### Edit journal link

`href="/dashboard/journal#{entryId}"` — the journal page should already scroll to entry. (If not already wired, scope-creep avoided: just navigate to the page; user can find the entry.)

### Create journal CTA

`href="/dashboard/journal?date=2026-05-05"` — journal page reads the `date` query param and pre-fills the entry-date field for a new entry. If the journal page doesn't currently read this param, add it as part of this spec (one-liner: `useSearchParams` + initial state).

---

## 5. Stats Card Expansion

Current cards: `Month P&L`, `Trading Days`, `Green Days`.

Add two more cards:
- **Best Day**: e.g., `May 5  ·  +$420`. Date as `MMM D`. P&L colored green. If no profitable day this month, show `—`.
- **Worst Day**: `May 11  ·  -$180`. Red. If no losing day, show `—`.

Grid: 5 columns on desktop (`grid-template-columns: repeat(5, 1fr)`). On screens < 720px, drop to 2 columns auto-flow. On mobile, drop to 1 per row.

Below the cards, a single-line **vs-previous-month** delta:
- Format: `vs previous month: +$340 (+12%)` or `vs previous month: -$200 (-8%)`. Colored.
- "Previous month" means: same month logic shifted back by 1 (e.g., May → April).
- If the previous month had `$0` total, show `vs previous month: +$340 (new high)` instead of dividing by zero.
- This requires a second backend fetch for the previous month's trades. Reuse the same `from` / `to` range query; fire in parallel with the current-month fetch.

---

## 6. Today Button + Today Indicator

### Today button

Place between the left chevron and the month title in the calendar header:

```
[<]  [Today]  May 2026  [pnl|mood]  [>]
```

Disabled when the visible month equals the current month + year. Clicking sets `currentDate = new Date()`.

### Today indicator

In the day-cell render, when the cell's date matches today (same year/month/day):
- Add a 2px inset ring: `box-shadow: inset 0 0 0 2px var(--accent)`.
- Day number rendered bold.

### Future dates

Cells whose date is in the future (relative to "now"):
- `opacity: 0.4`
- `pointer-events: none`
- No background color regardless of P&L (won't have any, but defensive)

---

## 7. Keyboard Navigation

Page-local `useEffect` keydown listener, attached on mount, removed on unmount. Active only when no input/textarea has focus AND no drawer/modal is open.

| Key | Action |
|---|---|
| `←` | Previous month |
| `→` | Next month |
| `T` | Jump to current month (no-op if already there) |
| `Esc` | Close day drawer (handled inside the drawer component) |

When Sprint 4 ships its `ShortcutProvider`, these can move into that system. For now, page-local is fine — keeps the calendar self-contained.

---

## 8. Mobile Layout

Calendar should remain usable on phones (already a constraint per `IMPROVEMENT_PLAN.md` P1-U1 which has shipped basic mobile sidebar).

- **< 640px**: 8-column grid is too tight. Drop the Week column to a row below each week (a thin strip, same `+$420 · 5 trades` content).
- **Cells**: still tap-able; cell P&L number can shrink to `text-xs`.
- **Drawer**: full-width slide from right; `width: 100vw`.
- **Stat cards**: 1 per row.

---

## 9. Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│  CalendarPage                                               │
│                                                             │
│  State:                                                     │
│   - currentDate (visible month)                             │
│   - trades (this month, closed)                             │
│   - prevTrades (previous month, closed)                     │
│   - journal (all entries; indexed client-side)              │
│   - drawerDate | null                                       │
│                                                             │
│  On month change → fire two trades fetches + one journal:   │
│   GET /trades?from=YYYY-MM-01&to=YYYY-MM-{lastDay}&status=CLOSED │
│   GET /trades?from=PREV_FROM&to=PREV_TO&status=CLOSED           │
│   GET /journal                                                  │
│                                                             │
│  Derived:                                                   │
│   - pnlByDate, moodByDate (indexes)                         │
│   - bestDay, worstDay (scan pnlByDate)                      │
│   - vsPrevDelta (sum prevTrades - sum trades)               │
│   - cells with week subtotals                               │
│                                                             │
│  Renders → grid + drawer (conditional)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. Testing

- **Backend** (`apps/api`): add tests for `GET /trades` date range filter:
  - Trades with `exitDate` inside range included.
  - Trades with `exitDate` outside range excluded.
  - Open trades (no `exitDate`) excluded when range is set.
  - Invalid date strings → 400.
  - `accountId + from + to` combine correctly.
- **Frontend** (`apps/web`): add tests for pure helpers:
  - `computeWeekSubtotals(cells)` → array of `{pnl, trades}` per week.
  - `findBestWorstDay(pnlByDate)` → `{best: {date, pnl} | null, worst: {date, pnl} | null}`.
  - `computeVsPrevDelta(currentSum, prevSum)` → `{delta, percent | null}`.
- **Manual verification**:
  - Drawer opens on click, closes on Esc/backdrop.
  - Today indicator on correct cell.
  - Future days dimmed and non-interactive.
  - Keyboard nav works across month boundaries (year wrap).
  - Mood colors look right in both themes.
  - With > 50 closed trades, every closed trade shows up.

---

## 11. Out of Scope (Recap)

- Year / heatmap view
- Quarter or multi-month view
- Account / tag / strategy filters on the calendar
- Drag to select date range
- Export
- Future-day planning
- Inline journal editing inside the drawer (link out to journal page instead)
- Mini-dashboard charts inside the drawer

These are good ideas for a "Calendar 2.0" pass — not this spec.
