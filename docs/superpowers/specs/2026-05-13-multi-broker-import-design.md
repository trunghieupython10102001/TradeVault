# Multi-Broker CSV Import — Design Spec

> Date: 2026-05-13
> Scope: Add a broker-adapter registry so the import endpoint understands more than one CSV layout. Ship Exness as the second supported format.

---

## Background

The import endpoint at `POST /trades/import` currently hard-codes column names from the MetaTrader 4/5 trade-history export (`Ticket`, `Open`, `Type`, `Volume`, `Symbol`, `Price`, `SL`, `TP`, `Close`, `Swap`, `Commissions`, `Profit`, etc.). Exness exports a structurally different CSV (snake_case headers: `ticket`, `opening_time_utc`, `closing_time_utc`, `type`, `lots`, `symbol`, `opening_price`, `closing_price`, `stop_loss`, `take_profit`, `commission`, `swap`, `profit`, `equity`, `margin_level`, `close_reason`). The current parser produces zero usable rows from an Exness file — every row is skipped for "missing required fields".

`IMPROVEMENT_PLAN.md` P3-F10 anticipated this and called out the need to support additional broker formats. The user has an Exness account and needs Exness today; other brokers (IB, ThinkorSwim, Tradezella) are still deferred.

## Goals

1. Successfully import an Exness "trades" CSV in the format observed in `/Users/harry/Downloads/01_01_2025-12_05_2026.csv`.
2. Replace the inline parsing logic in `routes/trades.ts` with a small adapter registry, so adding a third broker later is "add one file + register it" — not "modify the route".
3. Preserve all current MT4/MT5 behavior (no regressions): same column mapping, same Balance-column auto-detect, same upsert behavior keyed on broker ticket.
4. Update the import UI to: (a) auto-detect the broker, (b) show which one was detected, (c) allow a manual override when the user wants to force a specific adapter.

## Non-Goals

- Interactive Brokers, ThinkorSwim, Tradovate, Tradezella adapters. (Stub the registry so any of these can be added later, but do not implement them.)
- Excel (XLSX) import. Stay CSV-only.
- Trade attribute extensions to capture broker-specific fields like `close_reason` (Exness) or `Pips` (MT4). Out of scope.
- Multi-file / batch import. One file per request.
- Real-time broker API sync. Out of scope (separate feature track).

---

## 1. Adapter Architecture

### Interface

New file: `apps/api/src/lib/brokerAdapters/types.ts`

```ts
import type { CsvRow } from '../csvParser';

export type Side = 'LONG' | 'SHORT';

export interface NormalizedTrade {
  // The minimum needed to upsert a Trade row. The route layer wraps these
  // with the user's accountId / userId and runs r-multiple etc.
  brokerTicketId: string | null;
  symbol: string;
  side: Side;
  entryDate: Date;
  exitDate: Date | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  stopLoss: number | null;
  takeProfit: number | null;
  commission: number;   // absolute, combined commission + swap
  pnl: number | null;   // net P&L if closed; null if open
}

export interface ParseSkip {
  skip: true;
  reason: string;
}

export type ParseResult = NormalizedTrade | ParseSkip;

export interface BalanceHint {
  // For brokers (MT4/MT5) that emit a running Balance column.
  // Returns the implied initial balance derived from the first row's
  // (Balance - Profit - Swap - Commission), or null if unknown.
  detectInitialBalance?: (rows: CsvRow[]) => number | null;
}

export interface BrokerAdapter extends BalanceHint {
  /** Stable identifier used in the API and UI. */
  name: string;            // 'mt4mt5' | 'exness'
  /** Human label shown in the UI. */
  displayName: string;     // 'MT4 / MT5' | 'Exness'
  /**
   * Decide whether this adapter recognizes the CSV. Receives the array
   * of header strings (already lowercased and trimmed).
   */
  detect: (lowerHeaders: string[]) => boolean;
  /**
   * Convert a single CSV row to a NormalizedTrade. Return { skip, reason }
   * to skip the row (e.g., it's a deposit row, not a trade).
   */
  parseRow: (row: CsvRow) => ParseResult;
  /**
   * Columns this adapter expects, for the UI "Expected CSV Format" card.
   */
  expectedColumns: string[];
}
```

### Registry

New file: `apps/api/src/lib/brokerAdapters/index.ts`

```ts
import type { BrokerAdapter } from './types';
import { mt4mt5Adapter } from './mt4mt5';
import { exnessAdapter } from './exness';

export const adapters: BrokerAdapter[] = [exnessAdapter, mt4mt5Adapter];

export function detectAdapter(headers: string[]): BrokerAdapter | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const a of adapters) {
    if (a.detect(lower)) return a;
  }
  return null;
}

export function getAdapter(name: string): BrokerAdapter | null {
  return adapters.find((a) => a.name === name) ?? null;
}
```

Adapter order matters for `detectAdapter`: Exness is listed first because its snake_case `ticket` header would also match a permissive MT4 detector if both ran. Each adapter's `detect` must be strict enough that this isn't a problem, but the explicit ordering is a belt-and-suspenders move.

### Route changes

`apps/api/src/routes/trades.ts` `POST /trades/import`:

1. Add `broker?: string` to the request body. When present, look up via `getAdapter(broker)`; if missing/unknown, return `400 { error: 'Unknown broker: <name>' }`.
2. When `broker` is omitted, call `detectAdapter(headers)`. If `null`, return `400 { error: 'Could not detect broker format. Supported: MT4/MT5, Exness. Supply { broker } to override.' }`.
3. Loop over `rows`, call `adapter.parseRow(row)`. On `{ skip, reason }`, push to `skipped`. Otherwise apply the existing R-multiple / pnlPercent calculations and run the same upsert path keyed on `brokerTicketId`.
4. Starting-balance auto-detect: call `adapter.detectInitialBalance?.(rows)` (if defined). MT4/MT5 keeps its existing logic; Exness has none.
5. Add `broker` to the response: `{ success, broker: 'exness', imported, ... }`.

The route should not import or reference any specific adapter — only the registry helpers. This is the contract.

### Headers helper

`parseCsv` already returns rows. The route needs the headers list separately for `detectAdapter`. Two options:

- **A) Expose headers from `parseCsv`**: change return type to `{ headers: string[]; rows: CsvRow[] }`. Cleaner.
- **B) Re-parse the first line in the route**: cheap but duplicates parsing.

Pick A. It's used in exactly one place; the migration is mechanical.

---

## 2. MT4 / MT5 Adapter (extracted from current code)

File: `apps/api/src/lib/brokerAdapters/mt4mt5.ts`

The MT4/MT5 adapter is the current behavior, lifted verbatim into the new interface. No semantic changes.

**`name`**: `'mt4mt5'`
**`displayName`**: `'MT4 / MT5'`
**`detect`**: returns `true` when headers include `ticket` AND `open` AND `close` AND `volume` AND `commissions` (case-insensitive on the lowercase array passed in). This is the MetaTrader Title-Case set.
**`expectedColumns`**: the existing 15-item list from the UI (Ticket, Open, Type, Volume, Symbol, Price (entry), SL, TP, Close, Price (exit), Swap, Commissions, Profit, Pips, Duration).
**`parseRow`**: lifted from `routes/trades.ts` lines ~421–466 (Ticket/Open/Type/Volume/Symbol/Price/SL/TP/Close/Price_2/Swap/Commissions/Profit). Skip rules carry over verbatim: "Missing required fields..." and "Unknown trade type...".
**`detectInitialBalance`**: lifted from `routes/trades.ts` lines ~389–401 (Balance - Profit - Swap - Commissions on row 0).

**Side-effects to preserve:**
- Same `Math.abs(commissions) + Math.abs(swap)` combined-commission calculation.
- Same `profit + swap + commissions` net P&L.
- Same `Price_2` (duplicate-header) handling for exit price, with positional fallback `_col_9`.

---

## 3. Exness Adapter (new)

File: `apps/api/src/lib/brokerAdapters/exness.ts`

### Header set (observed)
```
ticket, opening_time_utc, closing_time_utc, type, lots, original_position_size,
symbol, opening_price, closing_price, stop_loss, take_profit, commission, swap,
profit, equity, margin_level, close_reason
```

### `detect`

Returns `true` when the lowercase headers include `ticket` AND `opening_time_utc` AND `closing_time_utc` AND `lots` AND `opening_price` AND `closing_price`. The combination is unique to Exness — no other broker uses `opening_time_utc` plus `lots`.

### `parseRow` (concrete behavior)

```ts
function parseRow(row: CsvRow): ParseResult {
  const ticket = (row['ticket'] ?? '').trim();
  const openStr = (row['opening_time_utc'] ?? '').trim();
  const closeStr = (row['closing_time_utc'] ?? '').trim();
  const type = (row['type'] ?? '').trim().toLowerCase();
  const lots = parseFloat(row['lots'] || '0');
  const symbol = (row['symbol'] ?? '').trim().toUpperCase();
  const entryPrice = parseFloat(row['opening_price'] || '0');
  const closingPriceRaw = (row['closing_price'] ?? '').trim();
  const sl = parseFloat(row['stop_loss'] || '0');
  const tp = parseFloat(row['take_profit'] || '0');
  const commission = parseFloat(row['commission'] || '0'); // may be empty/0
  const swap = parseFloat(row['swap'] || '0');
  const profit = parseFloat(row['profit'] || '0');

  if (!symbol || !openStr || !entryPrice || !lots) {
    return { skip: true, reason: 'Missing required fields (symbol, opening_time_utc, opening_price, lots)' };
  }
  if (type !== 'buy' && type !== 'sell') {
    return { skip: true, reason: `Unknown trade type: "${type}"` };
  }

  const side: Side = type === 'buy' ? 'LONG' : 'SHORT';
  const entryDate = new Date(openStr);
  if (isNaN(entryDate.getTime())) {
    return { skip: true, reason: `Invalid opening_time_utc: "${openStr}"` };
  }
  const hasExit = closeStr !== '' && closingPriceRaw !== '';
  const exitDate = hasExit ? new Date(closeStr) : null;
  if (exitDate && isNaN(exitDate.getTime())) {
    return { skip: true, reason: `Invalid closing_time_utc: "${closeStr}"` };
  }
  const exitPrice = hasExit ? parseFloat(closingPriceRaw) : null;

  const totalCommission = Math.abs(commission) + Math.abs(swap);
  const netPnl = hasExit ? profit + swap + commission : null;

  return {
    brokerTicketId: ticket || null,
    symbol,
    side,
    entryDate,
    exitDate,
    entryPrice,
    exitPrice,
    quantity: lots,
    stopLoss: sl > 0 ? sl : null,
    takeProfit: tp > 0 ? tp : null,
    commission: totalCommission,
    pnl: netPnl,
  };
}
```

### Notes on Exness specifics
- **Dates** are ISO 8601 strings (`2026-05-12T07:02:03`). The `new Date(...)` constructor parses these without TZ offset → JavaScript treats them as local. To preserve the broker's intent ("UTC", per the column name), append `'Z'` if not present:

  ```ts
  function toUtcDate(s: string): Date {
    const trimmed = s.trim();
    if (!trimmed) return new Date(NaN);
    // Force UTC parsing when no offset is provided.
    const withZ = /Z|[+-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : trimmed + 'Z';
    return new Date(withZ);
  }
  ```

  Use `toUtcDate` for both `opening_time_utc` and `closing_time_utc`. This is the only date-handling difference between adapters; MT4/MT5 dates already include timezone context or are interpreted as local per the user's current behavior — leave that alone.

- **Fields ignored**: `original_position_size`, `equity`, `margin_level`, `close_reason`. The schema has no fields for these and they would clutter the trade record. `close_reason` (values: `user`, `tp`, `sl`, `so` for stop-out) could power useful analytics, but that's a separate spec.
- **No Balance column** → `detectInitialBalance` is not defined on this adapter. Users with prop-firm Exness accounts will rely on the existing manual `startingBalance` override in the import UI.
- **Empty commission/swap fields** are common (the user's file shows most rows have empty values). `parseFloat('')` returns `NaN`; we guard with `|| '0'` before parsing → `NaN` is impossible. ✓
- **Trade duration < 1 second**: not a special case; the adapter doesn't compute duration.

### `expectedColumns`

For the UI "Expected CSV Format" card:
```
ticket, opening_time_utc, closing_time_utc, type, lots, symbol,
opening_price, closing_price, stop_loss, take_profit, commission, swap, profit
```

The four ignored columns are intentionally omitted to keep the card focused.

---

## 4. Frontend Changes

### `apps/web/src/app/dashboard/trades/import/page.tsx`

**Add state:**
```ts
type BrokerOption = 'auto' | 'mt4mt5' | 'exness';
const [broker, setBroker] = useState<BrokerOption>('auto');
const [detectedBroker, setDetectedBroker] = useState<string | null>(null);
```

**Add broker selector** above the "Expected CSV Format" card:

```
Broker format
[ Auto-detect ▾ ]   (Auto, MT4 / MT5, Exness)
```

Render the broker dropdown using existing form styles. Default to `Auto-detect`.

**Update "Expected CSV Format" card**:
- When `broker === 'auto'` and no `detectedBroker` yet → show generic text "We'll detect your broker automatically. Supported: MT4/MT5, Exness."
- When `broker !== 'auto'` (or `detectedBroker` is set) → show that broker's `expectedColumns` chips. This means the UI needs the column list per broker. Two options:
  - Hardcode the two column lists on the frontend (small, OK for two adapters).
  - Add a `GET /trades/import/brokers` endpoint that returns `[{ name, displayName, expectedColumns }]`. More elegant, scales.

  **Pick: hardcode for now.** Two brokers; YAGNI. When a third is added, revisit.

**Update import request body:**
```ts
body: JSON.stringify({
  csv: csvContent,
  startingBalance: ...,
  broker: broker === 'auto' ? undefined : broker,
})
```

**Show detected broker in result:**
After import succeeds, the result banner shows: `Detected: MT4 / MT5 — Import Complete`. Pull from `result.broker`.

**Update subtitle:** `Upload a CSV export from your broker. Supported formats: MT4/MT5, Exness.`

### No new pages or components

All changes live in `import/page.tsx`. No new files on the frontend.

---

## 5. Detection precedence (edge case)

If a future broker's headers happen to look like a subset of another broker's, detection order in the registry matters. To keep this robust:

- Each adapter's `detect` should require headers that collectively *uniquely identify* its format, not just "looks like it might be".
- The registry test (see Testing below) includes a "no false positives" check: each broker's sample CSV must be detected as its own broker, not another's.

---

## 6. Error handling

- **Unknown headers** (no adapter matches): `400 { error: 'Could not detect broker format. Supported: MT4/MT5, Exness. Pick a broker manually.' }`
- **Unknown manual broker name**: `400 { error: 'Unknown broker: <value>. Supported: mt4mt5, exness.' }`
- **Empty CSV** (existing behavior): `400 { error: 'No data rows found in CSV' }`
- **Per-row errors**: `parseRow` returns `{ skip, reason }`; route accumulates into `skipped[]` (existing behavior).

The route never throws on a single bad row; it skips and continues. The user sees per-row reasons in the import result. ✓

---

## 7. Testing

### Backend unit tests (Vitest, already configured)

File: `apps/api/src/lib/brokerAdapters/__tests__/exness.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { exnessAdapter } from '../exness';
import { parseCsv } from '../../csvParser';

const SAMPLE = `ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,equity,margin_level,close_reason
732465020,2026-05-12T07:02:03,2026-05-12T08:43:35,buy,0.01,0.01,XAUUSD,4695.147,4700.062,,4721.5,,,4.91,,,user
732412145,2026-05-12T06:09:01,2026-05-12T08:43:35,buy,0.01,0.01,XAUUSD,4705.381,4700.002,,4721.5,,,-5.38,,,user
731499367,2026-05-11T06:44:20,2026-05-11T09:25:00,sell,0.04,0.04,XAUUSD,4675.227,4659,,4659,,,64.91,,,tp`;

describe('exnessAdapter', () => {
  it('detects an Exness CSV', () => {
    const { headers } = parseCsv(SAMPLE);
    expect(exnessAdapter.detect(headers.map((h) => h.toLowerCase()))).toBe(true);
  });

  it('parses a winning buy', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = exnessAdapter.parseRow(rows[0]!);
    expect('skip' in result).toBe(false);
    if ('skip' in result) return;
    expect(result.symbol).toBe('XAUUSD');
    expect(result.side).toBe('LONG');
    expect(result.quantity).toBe(0.01);
    expect(result.entryPrice).toBeCloseTo(4695.147);
    expect(result.exitPrice).toBeCloseTo(4700.062);
    expect(result.pnl).toBeCloseTo(4.91);
    expect(result.commission).toBe(0);
  });

  it('parses a losing buy', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = exnessAdapter.parseRow(rows[1]!);
    expect('skip' in result).toBe(false);
    if ('skip' in result) return;
    expect(result.pnl).toBeCloseTo(-5.38);
  });

  it('parses a sell with take_profit hit', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = exnessAdapter.parseRow(rows[2]!);
    expect('skip' in result).toBe(false);
    if ('skip' in result) return;
    expect(result.side).toBe('SHORT');
    expect(result.takeProfit).toBe(4659);
  });

  it('treats opening_time_utc as UTC even without Z suffix', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = exnessAdapter.parseRow(rows[0]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.entryDate.toISOString()).toBe('2026-05-12T07:02:03.000Z');
  });

  it('skips a row with unknown type', () => {
    const row = parseCsv(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price\n1,2026-01-01T00:00:00,2026-01-01T01:00:00,flarp,1,X,1,2`).rows[0]!;
    const result = exnessAdapter.parseRow(row);
    expect('skip' in result).toBe(true);
  });

  it('skips a row missing required fields', () => {
    const row = parseCsv(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price\n1,2026-01-01T00:00:00,,buy,,,1,`).rows[0]!;
    const result = exnessAdapter.parseRow(row);
    expect('skip' in result).toBe(true);
  });
});
```

File: `apps/api/src/lib/brokerAdapters/__tests__/registry.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { detectAdapter, getAdapter } from '..';

describe('broker adapter registry', () => {
  it('detects Exness headers', () => {
    const a = detectAdapter(['ticket','opening_time_utc','closing_time_utc','type','lots','symbol','opening_price','closing_price']);
    expect(a?.name).toBe('exness');
  });

  it('detects MT4/MT5 headers', () => {
    const a = detectAdapter(['Ticket','Open','Type','Volume','Symbol','Price','SL','TP','Close','Price','Swap','Commissions','Profit']);
    expect(a?.name).toBe('mt4mt5');
  });

  it('returns null for unknown headers', () => {
    expect(detectAdapter(['foo','bar','baz'])).toBeNull();
  });

  it('getAdapter returns named adapter or null', () => {
    expect(getAdapter('exness')?.name).toBe('exness');
    expect(getAdapter('nope')).toBeNull();
  });
});
```

File: `apps/api/src/lib/brokerAdapters/__tests__/mt4mt5.test.ts`

Add at least one test verifying the existing MT4/MT5 path: parse a 1-row MT4 sample (same one currently in production use); confirm side/symbol/pnl come out identical to the values produced by the pre-refactor route. This is a regression guard for the refactor.

### Manual verification

1. Visit `/dashboard/trades/import`, drop the Exness file `/Users/harry/Downloads/01_01_2025-12_05_2026.csv`, click import with broker=Auto.
   - Detected: Exness.
   - Imported count matches non-skipped rows.
   - Visit `/dashboard/trades` and spot-check 3 trades against the source CSV (symbol, side, entry/exit, P&L).
2. Repeat with broker manually set to "Exness" — same outcome.
3. Repeat with an MT4 file (existing user fixture if available) — no regression, detected as MT4/MT5, same import result as before.
4. Try uploading a random CSV (e.g., the equity-export from `/dashboard/trades/export?format=csv`) — UI shows "Could not detect broker format".
5. Set `broker=exness` manually but upload an MT4 file — every row gets skipped with a clean reason (no crash).

---

## 8. Migration / Compatibility

This is an additive refactor:

- **API contract**: `POST /trades/import` continues to accept `{ csv, startingBalance? }`. Adding the optional `broker` field is backward-compatible.
- **Response**: gains a `broker` field, but existing fields remain. The frontend can read the new field; older clients ignore it.
- **DB schema**: unchanged. `brokerTicketId` already exists and works for both adapters (Exness `ticket` is a number string, MT4 `Ticket` is a number string — same idea).
- **Existing imports**: unaffected. The MT4/MT5 adapter is functionally identical to the inline code it replaces.

---

## 9. File layout

```
apps/api/src/lib/brokerAdapters/
  index.ts                ← registry + helpers
  types.ts                ← BrokerAdapter, NormalizedTrade interfaces
  mt4mt5.ts               ← extracted from current route
  exness.ts               ← new
  __tests__/
    registry.test.ts
    mt4mt5.test.ts
    exness.test.ts

apps/api/src/lib/csvParser.ts
  — modified: return { headers, rows } instead of just rows

apps/api/src/routes/trades.ts
  — modified: POST /trades/import uses the registry; inline parsing removed

apps/web/src/app/dashboard/trades/import/page.tsx
  — modified: broker dropdown, detected-broker display, dynamic expected-columns card
```

No other files change.

---

## 10. Out of Scope (recap)

- More broker adapters beyond MT4/MT5 and Exness (P3-F10 leftovers).
- XLSX/Excel parsing.
- New trade fields for broker-specific metadata (`close_reason`, `Pips`, etc.).
- A `GET /trades/import/brokers` discovery endpoint. Not yet needed.
- Multi-file batch upload.
- Real-time broker API integration.

These are not blockers for shipping Exness support and can layer in later without revisiting this architecture.
