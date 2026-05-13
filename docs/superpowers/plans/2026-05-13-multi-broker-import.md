# Multi-Broker CSV Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract MT4/MT5 parsing into a broker adapter registry and add an Exness adapter so the user can import Exness trade-history CSVs.

**Architecture:** Adapter registry pattern: each broker has a self-contained module exposing `name`, `detect(headers)`, `parseRow(row)`, and `expectedColumns`. The `/trades/import` route picks an adapter (auto-detect or via `broker` request field) and feeds rows through it. The frontend adds a broker dropdown and shows the detected broker.

**Tech Stack:** Express, Prisma, TypeScript, Vitest (test framework already configured in both apps), Next.js 16 (App Router), React 19.

**Source spec:** `docs/superpowers/specs/2026-05-13-multi-broker-import-design.md`

**Node version:** Run npm commands with Node 20+. Prefix with `export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.1 &&` if using nvm.

---

## File Map

```
apps/api/src/lib/csvParser.ts                  ← MODIFY (return { headers, rows })
apps/api/src/lib/brokerAdapters/types.ts       ← CREATE
apps/api/src/lib/brokerAdapters/mt4mt5.ts      ← CREATE (extracted from route)
apps/api/src/lib/brokerAdapters/exness.ts      ← CREATE
apps/api/src/lib/brokerAdapters/index.ts       ← CREATE (registry helpers)
apps/api/src/lib/brokerAdapters/__tests__/mt4mt5.test.ts   ← CREATE
apps/api/src/lib/brokerAdapters/__tests__/exness.test.ts   ← CREATE
apps/api/src/lib/brokerAdapters/__tests__/registry.test.ts ← CREATE
apps/api/src/routes/trades.ts                  ← MODIFY (use registry)
apps/web/src/app/dashboard/trades/import/page.tsx ← MODIFY (broker dropdown)
```

---

## Phase 1 — Foundation

### Task 1: Update `csvParser` to return headers + rows

**Files:**
- Modify: `apps/api/src/lib/csvParser.ts`

This is a breaking change for any caller. The only caller today is `apps/api/src/routes/trades.ts` line ~370 (`const rows = parseCsv(csv);`). We'll update that in Task 7.

- [ ] **Step 1: Update `csvParser.ts` return shape**

Replace `apps/api/src/lib/csvParser.ts` body so `parseCsv` returns `{ headers, rows }`:

```ts
export interface CsvRow {
  [key: string]: string;
}

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
}

export function parseCsv(text: string): ParsedCsv {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]!).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: CsvRow = {};

    const seen: Record<string, number> = {};
    headers.forEach((h, idx) => {
      const count = seen[h] ?? 0;
      const key = count === 0 ? h : `${h}_${count + 1}`;
      row[key] = (values[idx] ?? '').trim();
      seen[h] = count + 1;
      row[`_col_${idx}`] = (values[idx] ?? '').trim();
    });

    rows.push(row);
  }

  return { headers, rows };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
```

- [ ] **Step 2: Verify TypeScript compiles (parseCsv old callsite will error)**

Run: `cd apps/api && npx tsc --noEmit 2>&1 | head -20`
Expected: ERROR in `routes/trades.ts` — `Type 'ParsedCsv' is not assignable to type 'CsvRow[]'` or similar. Task 7 fixes the callsite. Do not commit yet; commit after Task 7 makes the API consistent again.

Actually — to keep commits self-contained, fix the callsite minimally in this same task so the build stays green:

In `apps/api/src/routes/trades.ts` line ~370 change:
```ts
const rows = parseCsv(csv);
```
to:
```ts
const { rows } = parseCsv(csv);
```

Re-run: `cd apps/api && npx tsc --noEmit 2>&1 | head -10`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/csvParser.ts apps/api/src/routes/trades.ts
git commit -m "refactor(csv): parseCsv returns { headers, rows }"
```

---

### Task 2: Define adapter types

**Files:**
- Create: `apps/api/src/lib/brokerAdapters/types.ts`

- [ ] **Step 1: Create the types file**

```ts
import type { CsvRow } from '../csvParser';

export type Side = 'LONG' | 'SHORT';

export interface NormalizedTrade {
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
  commission: number;
  pnl: number | null;
}

export interface ParseSkip {
  skip: true;
  reason: string;
}

export type ParseResult = NormalizedTrade | ParseSkip;

export interface BrokerAdapter {
  name: string;
  displayName: string;
  detect: (lowerHeaders: string[]) => boolean;
  parseRow: (row: CsvRow) => ParseResult;
  expectedColumns: string[];
  detectInitialBalance?: (rows: CsvRow[]) => number | null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: clean (file has no usages yet).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/brokerAdapters/types.ts
git commit -m "feat(brokers): add BrokerAdapter interface"
```

---

## Phase 2 — Exness Adapter (TDD)

### Task 3: Write failing tests for the Exness adapter

**Files:**
- Create: `apps/api/src/lib/brokerAdapters/__tests__/exness.test.ts`

- [ ] **Step 1: Create the test file**

```ts
import { describe, it, expect } from 'vitest';
import { exnessAdapter } from '../exness';
import { parseCsv } from '../../csvParser';

const SAMPLE = `ticket,opening_time_utc,closing_time_utc,type,lots,original_position_size,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit,equity,margin_level,close_reason
732465020,2026-05-12T07:02:03,2026-05-12T08:43:35,buy,0.01,0.01,XAUUSD,4695.147,4700.062,,4721.5,,,4.91,,,user
732412145,2026-05-12T06:09:01,2026-05-12T08:43:35,buy,0.01,0.01,XAUUSD,4705.381,4700.002,,4721.5,,,-5.38,,,user
731499367,2026-05-11T06:44:20,2026-05-11T09:25:00,sell,0.04,0.04,XAUUSD,4675.227,4659,,4659,,,64.91,,,tp`;

describe('exnessAdapter', () => {
  it('detects an Exness CSV from its headers', () => {
    const { headers } = parseCsv(SAMPLE);
    expect(exnessAdapter.detect(headers.map((h) => h.toLowerCase()))).toBe(true);
  });

  it('does not detect non-Exness headers', () => {
    expect(exnessAdapter.detect(['ticket', 'open', 'close', 'volume', 'commissions'])).toBe(false);
  });

  it('parses a winning buy', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = exnessAdapter.parseRow(rows[0]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.brokerTicketId).toBe('732465020');
    expect(result.symbol).toBe('XAUUSD');
    expect(result.side).toBe('LONG');
    expect(result.quantity).toBe(0.01);
    expect(result.entryPrice).toBeCloseTo(4695.147);
    expect(result.exitPrice).toBeCloseTo(4700.062);
    expect(result.takeProfit).toBe(4721.5);
    expect(result.stopLoss).toBeNull();
    expect(result.pnl).toBeCloseTo(4.91);
    expect(result.commission).toBe(0);
  });

  it('parses a losing buy', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = exnessAdapter.parseRow(rows[1]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.pnl).toBeCloseTo(-5.38);
  });

  it('parses a sell with take_profit set', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = exnessAdapter.parseRow(rows[2]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.side).toBe('SHORT');
    expect(result.takeProfit).toBe(4659);
  });

  it('parses opening_time_utc as UTC even without trailing Z', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = exnessAdapter.parseRow(rows[0]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.entryDate.toISOString()).toBe('2026-05-12T07:02:03.000Z');
  });

  it('skips a row with unknown trade type', () => {
    const { rows } = parseCsv(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price\n1,2026-01-01T00:00:00,2026-01-01T01:00:00,flarp,1,X,1,2`);
    const result = exnessAdapter.parseRow(rows[0]!);
    expect('skip' in result).toBe(true);
  });

  it('skips a row missing required fields', () => {
    const { rows } = parseCsv(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price\n1,,,buy,,,,`);
    const result = exnessAdapter.parseRow(rows[0]!);
    expect('skip' in result).toBe(true);
  });

  it('handles an open (no close) row by setting exit fields to null', () => {
    const { rows } = parseCsv(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit\n9,2026-01-01T10:00:00,,buy,0.1,EURUSD,1.1,,,,,,`);
    const result = exnessAdapter.parseRow(rows[0]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.exitDate).toBeNull();
    expect(result.exitPrice).toBeNull();
    expect(result.pnl).toBeNull();
  });

  it('combines commission + swap into the commission field', () => {
    const { rows } = parseCsv(`ticket,opening_time_utc,closing_time_utc,type,lots,symbol,opening_price,closing_price,stop_loss,take_profit,commission,swap,profit\n9,2026-01-01T10:00:00,2026-01-01T11:00:00,buy,0.1,EURUSD,1.1,1.2,,,-1.5,-0.5,10`);
    const result = exnessAdapter.parseRow(rows[0]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.commission).toBe(2.0);
    expect(result.pnl).toBeCloseTo(10 - 1.5 - 0.5); // profit + commission + swap (commission and swap are already negative)
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd apps/api && npm test -- exness.test.ts`
Expected: FAIL — module `../exness` not found.

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/api/src/lib/brokerAdapters/__tests__/exness.test.ts
git commit -m "test(brokers): add failing Exness adapter tests"
```

---

### Task 4: Implement the Exness adapter

**Files:**
- Create: `apps/api/src/lib/brokerAdapters/exness.ts`

- [ ] **Step 1: Write the adapter**

```ts
import type { BrokerAdapter, ParseResult, Side } from './types';
import type { CsvRow } from '../csvParser';

function toUtcDate(s: string): Date {
  const trimmed = s.trim();
  if (!trimmed) return new Date(NaN);
  const withZ = /Z|[+-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : trimmed + 'Z';
  return new Date(withZ);
}

const REQUIRED_HEADERS = [
  'ticket',
  'opening_time_utc',
  'closing_time_utc',
  'lots',
  'opening_price',
  'closing_price',
];

export const exnessAdapter: BrokerAdapter = {
  name: 'exness',
  displayName: 'Exness',
  expectedColumns: [
    'ticket', 'opening_time_utc', 'closing_time_utc', 'type', 'lots', 'symbol',
    'opening_price', 'closing_price', 'stop_loss', 'take_profit',
    'commission', 'swap', 'profit',
  ],
  detect(lowerHeaders) {
    return REQUIRED_HEADERS.every((h) => lowerHeaders.includes(h));
  },
  parseRow(row: CsvRow): ParseResult {
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
    const commission = parseFloat(row['commission'] || '0');
    const swap = parseFloat(row['swap'] || '0');
    const profit = parseFloat(row['profit'] || '0');

    if (!symbol || !openStr || !entryPrice || !lots) {
      return { skip: true, reason: 'Missing required fields (symbol, opening_time_utc, opening_price, lots)' };
    }
    if (type !== 'buy' && type !== 'sell') {
      return { skip: true, reason: `Unknown trade type: "${type}"` };
    }

    const entryDate = toUtcDate(openStr);
    if (isNaN(entryDate.getTime())) {
      return { skip: true, reason: `Invalid opening_time_utc: "${openStr}"` };
    }

    const hasExit = closeStr !== '' && closingPriceRaw !== '';
    const exitDate = hasExit ? toUtcDate(closeStr) : null;
    if (exitDate && isNaN(exitDate.getTime())) {
      return { skip: true, reason: `Invalid closing_time_utc: "${closeStr}"` };
    }
    const exitPrice = hasExit ? parseFloat(closingPriceRaw) : null;

    const side: Side = type === 'buy' ? 'LONG' : 'SHORT';
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
  },
};
```

- [ ] **Step 2: Run tests, verify they pass**

Run: `cd apps/api && npm test -- exness.test.ts`
Expected: PASS — all 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/brokerAdapters/exness.ts
git commit -m "feat(brokers): add Exness adapter"
```

---

## Phase 3 — MT4/MT5 Adapter (extract from route)

### Task 5: Write tests for the MT4/MT5 adapter (regression guard)

**Files:**
- Create: `apps/api/src/lib/brokerAdapters/__tests__/mt4mt5.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect } from 'vitest';
import { mt4mt5Adapter } from '../mt4mt5';
import { parseCsv } from '../../csvParser';

// Sample row mirroring MT4/MT5 exports with duplicate "Price" columns
const SAMPLE = `Ticket,Open,Type,Volume,Symbol,Price,SL,TP,Close,Price,Swap,Commissions,Profit,Pips,Trade duration in seconds
12345,2026-01-01 10:00:00,buy,0.10,EURUSD,1.1000,1.0950,1.1100,2026-01-01 11:00:00,1.1050,-0.10,-2.00,50.00,50,3600
12346,2026-01-02 10:00:00,sell,0.05,XAUUSD,1800.00,1810.00,1790.00,2026-01-02 12:00:00,1795.00,0.00,-1.00,25.00,50,7200`;

describe('mt4mt5Adapter', () => {
  it('detects MT4/MT5 headers', () => {
    const { headers } = parseCsv(SAMPLE);
    expect(mt4mt5Adapter.detect(headers.map((h) => h.toLowerCase()))).toBe(true);
  });

  it('does not detect Exness headers', () => {
    expect(
      mt4mt5Adapter.detect(['ticket', 'opening_time_utc', 'closing_time_utc', 'lots', 'opening_price', 'closing_price']),
    ).toBe(false);
  });

  it('parses a winning buy with duplicate Price columns', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = mt4mt5Adapter.parseRow(rows[0]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.symbol).toBe('EURUSD');
    expect(result.side).toBe('LONG');
    expect(result.entryPrice).toBe(1.1);
    expect(result.exitPrice).toBe(1.105);
    expect(result.quantity).toBe(0.10);
    expect(result.commission).toBe(2.1);   // |0.10| + |2.00|
    expect(result.pnl).toBeCloseTo(50 + -0.10 + -2.00);
  });

  it('parses a sell', () => {
    const { rows } = parseCsv(SAMPLE);
    const result = mt4mt5Adapter.parseRow(rows[1]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.side).toBe('SHORT');
    expect(result.exitPrice).toBe(1795);
  });

  it('skips a row with unknown type', () => {
    const { rows } = parseCsv(`Ticket,Open,Type,Volume,Symbol,Price,SL,TP,Close,Price,Swap,Commissions,Profit\n1,2026-01-01 00:00:00,flarp,1,X,1,0,0,,,,,`);
    expect('skip' in mt4mt5Adapter.parseRow(rows[0]!)).toBe(true);
  });

  it('detectInitialBalance derives initial balance from row 0', () => {
    const { rows } = parseCsv(`Ticket,Open,Type,Volume,Symbol,Price,SL,TP,Close,Price,Swap,Commissions,Profit,Balance\n1,2026-01-01 00:00:00,buy,1,EURUSD,1,0,0,2026-01-01 01:00:00,1.05,-0.5,-1,10,10009.5`);
    const balance = mt4mt5Adapter.detectInitialBalance?.(rows);
    // initialBalance = Balance - Profit - Swap - Commissions = 10009.5 - 10 - (-0.5) - (-1) = 10001
    expect(balance).toBeCloseTo(10001);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd apps/api && npm test -- mt4mt5.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/api/src/lib/brokerAdapters/__tests__/mt4mt5.test.ts
git commit -m "test(brokers): add MT4/MT5 adapter regression tests"
```

---

### Task 6: Implement the MT4/MT5 adapter (extracted from route)

**Files:**
- Create: `apps/api/src/lib/brokerAdapters/mt4mt5.ts`

- [ ] **Step 1: Write the adapter**

```ts
import type { BrokerAdapter, ParseResult, Side } from './types';
import type { CsvRow } from '../csvParser';

const REQUIRED_LOWER = ['ticket', 'open', 'close', 'volume', 'commissions'];

export const mt4mt5Adapter: BrokerAdapter = {
  name: 'mt4mt5',
  displayName: 'MT4 / MT5',
  expectedColumns: [
    'Ticket', 'Open (date)', 'Type (buy/sell)', 'Volume', 'Symbol',
    'Price (entry)', 'SL', 'TP', 'Close (date)', 'Price (exit)',
    'Swap', 'Commissions', 'Profit', 'Pips', 'Duration',
  ],
  detect(lowerHeaders) {
    return REQUIRED_LOWER.every((h) => lowerHeaders.includes(h));
  },
  parseRow(row: CsvRow): ParseResult {
    const ticket = (row['Ticket'] ?? '').trim();
    const openDate = (row['Open'] ?? '').trim();
    const type = (row['Type'] ?? '').trim().toLowerCase();
    const volume = parseFloat(row['Volume'] || '0');
    const symbol = (row['Symbol'] ?? '').trim().toUpperCase();
    const entryPrice = parseFloat(row['Price'] || '0');
    const sl = parseFloat(row['SL'] || '0');
    const tp = parseFloat(row['TP'] || '0');
    const closeDate = (row['Close'] ?? '').trim();
    const exitPriceRaw = (row['Price_2'] ?? row['_col_9'] ?? '').trim();
    const swap = parseFloat(row['Swap'] || '0');
    const commissions = parseFloat(row['Commissions'] || '0');
    const profit = parseFloat(row['Profit'] || '0');

    if (!symbol || !openDate || !entryPrice || !volume) {
      return { skip: true, reason: 'Missing required fields (symbol, open date, entry price, volume)' };
    }
    if (type !== 'buy' && type !== 'sell') {
      return { skip: true, reason: `Unknown trade type: "${type}"` };
    }

    const side: Side = type === 'buy' ? 'LONG' : 'SHORT';
    const entryDate = new Date(openDate);
    const hasExit = closeDate !== '';
    const exitDate = hasExit ? new Date(closeDate) : null;
    const exitPrice = hasExit ? (exitPriceRaw ? parseFloat(exitPriceRaw) : null) : null;

    const totalCommission = Math.abs(commissions) + Math.abs(swap);
    const netPnl = hasExit ? profit + swap + commissions : null;

    return {
      brokerTicketId: ticket || null,
      symbol,
      side,
      entryDate,
      exitDate,
      entryPrice,
      exitPrice,
      quantity: volume,
      stopLoss: sl > 0 ? sl : null,
      takeProfit: tp > 0 ? tp : null,
      commission: totalCommission,
      pnl: netPnl,
    };
  },
  detectInitialBalance(rows: CsvRow[]): number | null {
    const first = rows[0];
    if (!first) return null;
    const balanceCol = parseFloat(first['Balance'] || '0');
    const firstProfit = parseFloat(first['Profit'] || '0');
    const firstSwap = parseFloat(first['Swap'] || '0');
    const firstComm = parseFloat(first['Commissions'] || '0');
    if (balanceCol > 0) return balanceCol - firstProfit - firstSwap - firstComm;
    return null;
  },
};
```

- [ ] **Step 2: Run tests, verify they pass**

Run: `cd apps/api && npm test -- mt4mt5.test.ts`
Expected: PASS — all 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/brokerAdapters/mt4mt5.ts
git commit -m "feat(brokers): add MT4/MT5 adapter extracted from route"
```

---

## Phase 4 — Registry + Route Wiring

### Task 7: Write tests for the registry

**Files:**
- Create: `apps/api/src/lib/brokerAdapters/__tests__/registry.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect } from 'vitest';
import { adapters, detectAdapter, getAdapter } from '..';

describe('broker adapter registry', () => {
  it('exposes both built-in adapters', () => {
    const names = adapters.map((a) => a.name).sort();
    expect(names).toEqual(['exness', 'mt4mt5']);
  });

  it('detects Exness from a lowercase header list', () => {
    const a = detectAdapter([
      'ticket', 'opening_time_utc', 'closing_time_utc',
      'type', 'lots', 'symbol', 'opening_price', 'closing_price',
    ]);
    expect(a?.name).toBe('exness');
  });

  it('detects MT4/MT5 from a Title-Case header list (lowercased by detect)', () => {
    const a = detectAdapter([
      'Ticket', 'Open', 'Type', 'Volume', 'Symbol',
      'Price', 'SL', 'TP', 'Close', 'Price',
      'Swap', 'Commissions', 'Profit',
    ]);
    expect(a?.name).toBe('mt4mt5');
  });

  it('returns null for unknown headers', () => {
    expect(detectAdapter(['foo', 'bar', 'baz'])).toBeNull();
  });

  it('getAdapter returns named adapter or null', () => {
    expect(getAdapter('exness')?.name).toBe('exness');
    expect(getAdapter('mt4mt5')?.name).toBe('mt4mt5');
    expect(getAdapter('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd apps/api && npm test -- registry.test.ts`
Expected: FAIL — module `..` (= `../index`) not found.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/brokerAdapters/__tests__/registry.test.ts
git commit -m "test(brokers): add registry tests"
```

---

### Task 8: Implement the registry

**Files:**
- Create: `apps/api/src/lib/brokerAdapters/index.ts`

- [ ] **Step 1: Write the registry**

```ts
import type { BrokerAdapter } from './types';
import { mt4mt5Adapter } from './mt4mt5';
import { exnessAdapter } from './exness';

export type { BrokerAdapter, NormalizedTrade, ParseResult, Side } from './types';

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

- [ ] **Step 2: Run all broker tests**

Run: `cd apps/api && npm test -- brokerAdapters`
Expected: PASS — all exness, mt4mt5, and registry tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/brokerAdapters/index.ts
git commit -m "feat(brokers): add adapter registry helpers"
```

---

### Task 9: Wire the route to use the registry

**Files:**
- Modify: `apps/api/src/routes/trades.ts`

- [ ] **Step 1: Read the current import route**

Run: `sed -n '359,524p' apps/api/src/routes/trades.ts`
Note line numbers may have shifted slightly after Task 1's edit. The handler is `router.post('/import', ...)`.

- [ ] **Step 2: Replace the import handler**

In `apps/api/src/routes/trades.ts`:

1. At the top of the file, add the import:
   ```ts
   import { detectAdapter, getAdapter, type NormalizedTrade } from '../lib/brokerAdapters';
   ```
   (And remove the now-unused inline ticket parsing logic — see Step 3.)

2. Replace the entire `router.post('/import', ...)` handler body with:

```ts
router.post('/import', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { csv, startingBalance, broker } = req.body as {
      csv: string;
      startingBalance?: number;
      broker?: string;
    };

    if (!csv || typeof csv !== 'string') {
      res.status(400).json({ error: 'CSV content is required' });
      return;
    }

    const { headers, rows } = parseCsv(csv);
    if (rows.length === 0) {
      res.status(400).json({ error: 'No data rows found in CSV' });
      return;
    }

    // Resolve adapter: explicit broker > auto-detect
    const adapter = broker ? getAdapter(broker) : detectAdapter(headers);
    if (broker && !adapter) {
      res.status(400).json({ error: `Unknown broker: ${broker}. Supported: mt4mt5, exness.` });
      return;
    }
    if (!adapter) {
      res.status(400).json({
        error: 'Could not detect broker format. Supported: MT4/MT5, Exness. Pick a broker manually.',
      });
      return;
    }

    // Get or create default account
    let account = await prisma.account.findFirst({
      where: { userId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) {
      account = await prisma.account.create({
        data: { userId, name: 'Default Account', initialBalance: 0, isDefault: true },
      });
    }
    const accountId = account.id;

    // Starting balance: explicit override > adapter auto-detect > unchanged
    let resolvedInitialBalance: number | null = null;
    if (startingBalance && startingBalance > 0) {
      resolvedInitialBalance = startingBalance;
    } else if (adapter.detectInitialBalance) {
      const detected = adapter.detectInitialBalance(rows);
      if (detected !== null && detected > 0) resolvedInitialBalance = detected;
    }
    if (resolvedInitialBalance !== null) {
      await prisma.account.update({
        where: { id: accountId },
        data: { initialBalance: resolvedInitialBalance },
      });
    }

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2;

      try {
        const parsed = adapter.parseRow(row);
        if ('skip' in parsed) {
          skipped.push({ row: rowNum, reason: parsed.reason });
          continue;
        }
        const t: NormalizedTrade = parsed;

        const tradeForCalc = {
          side: t.side,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          quantity: t.quantity,
          stopLoss: t.stopLoss,
          commission: t.commission,
        };

        const rMultipleRaw = (t.exitDate && t.stopLoss !== null && t.exitPrice !== null)
          ? calculateRMultiple({ ...tradeForCalc, exitPrice: t.exitPrice })
          : null;
        const rMultiple = (rMultipleRaw != null && Math.abs(rMultipleRaw) < 9999) ? rMultipleRaw : null;

        const tradeData = {
          accountId,
          symbol: t.symbol,
          side: t.side as any,
          status: t.exitDate ? 'CLOSED' : 'OPEN',
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          quantity: t.quantity,
          stopLoss: t.stopLoss,
          takeProfit: t.takeProfit,
          commission: t.commission,
          pnl: t.pnl,
          pnlPercent: null,
          rMultiple,
          entryDate: t.entryDate,
          exitDate: t.exitDate,
        };

        if (t.brokerTicketId) {
          const existing = await prisma.trade.findUnique({
            where: { unique_user_broker_ticket: { userId, brokerTicketId: t.brokerTicketId } },
            select: { id: true },
          });
          await prisma.trade.upsert({
            where: { unique_user_broker_ticket: { userId, brokerTicketId: t.brokerTicketId } },
            update: tradeData,
            create: { userId, brokerTicketId: t.brokerTicketId, ...tradeData },
          });
          if (existing) updated.push(t.brokerTicketId);
          else created.push(t.brokerTicketId);
        } else {
          await prisma.trade.create({ data: { userId, ...tradeData } });
          created.push(`row-${rowNum}`);
        }
      } catch (err: any) {
        skipped.push({ row: rowNum, reason: err.message || 'Unknown error' });
      }
    }

    res.json({
      success: true,
      broker: adapter.name,
      brokerLabel: adapter.displayName,
      imported: created.length + updated.length,
      created: created.length,
      updated: updated.length,
      skipped: skipped.length,
      skippedDetails: skipped,
    });
  } catch (error) {
    console.error('Error importing trades:', error);
    res.status(500).json({ error: 'Failed to import trades' });
  }
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 4: Run all API tests**

Run: `cd apps/api && npm test`
Expected: all tests pass, including the new broker tests.

- [ ] **Step 5: Manual smoke against the dev server**

Start both servers:
```bash
cd /Users/harry/Workspace/trading-journal && export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.1 && npm run dev
```

In another shell, with a JWT in `$TOKEN`:
```bash
CSV=$(cat /Users/harry/Downloads/01_01_2025-12_05_2026.csv | jq -Rs .)
curl -s -X POST http://localhost:4000/trades/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"csv\":$CSV}" | jq '.broker, .imported, .skipped'
```
Expected: `"exness"`, a positive `imported` number, low `skipped` count.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/trades.ts
git commit -m "feat(trades): wire import to broker adapter registry"
```

---

## Phase 5 — Frontend

### Task 10: Add broker dropdown to the import UI

**Files:**
- Modify: `apps/web/src/app/dashboard/trades/import/page.tsx`

- [ ] **Step 1: Read the file**

Run: `cat apps/web/src/app/dashboard/trades/import/page.tsx`
Note where state hooks are declared (around line 27-34) and where the "Expected CSV Format" card is rendered (line 125-139).

- [ ] **Step 2: Add broker-list constant and state**

At the top of the file, after the imports:

```tsx
type BrokerOption = 'auto' | 'mt4mt5' | 'exness';

const BROKER_LABELS: Record<Exclude<BrokerOption, 'auto'>, string> = {
  mt4mt5: 'MT4 / MT5',
  exness: 'Exness',
};

const BROKER_COLUMNS: Record<Exclude<BrokerOption, 'auto'>, string[]> = {
  mt4mt5: [
    'Ticket', 'Open (date)', 'Type (buy/sell)', 'Volume', 'Symbol',
    'Price (entry)', 'SL', 'TP', 'Close (date)', 'Price (exit)',
    'Swap', 'Commissions', 'Profit', 'Pips', 'Duration',
  ],
  exness: [
    'ticket', 'opening_time_utc', 'closing_time_utc', 'type', 'lots', 'symbol',
    'opening_price', 'closing_price', 'stop_loss', 'take_profit',
    'commission', 'swap', 'profit',
  ],
};
```

Inside the component (alongside the other `useState`s):

```tsx
const [broker, setBroker] = useState<BrokerOption>('auto');
```

- [ ] **Step 3: Update the request body to include `broker`**

In `handleImport`, change the JSON body to:

```tsx
body: JSON.stringify({
  csv: csvContent,
  startingBalance: startingBalance ? parseFloat(startingBalance) : undefined,
  broker: broker === 'auto' ? undefined : broker,
}),
```

- [ ] **Step 4: Update the `ImportResult` interface to surface detected broker**

```tsx
interface ImportResult {
  success: boolean;
  broker?: string;
  brokerLabel?: string;
  imported: number;
  created: number;
  updated: number;
  skipped: number;
  skippedDetails: SkippedRow[];
}
```

- [ ] **Step 5: Replace the "Expected CSV Format" card with a broker-aware version**

Replace the JSX block that renders the format card (currently lines ~125-139):

```tsx
<div className={styles.formatCard}>
  <div className={styles.formatHeader}>
    <h3 className={styles.formatTitle}>Broker format</h3>
    <select
      className={styles.brokerSelect}
      value={broker}
      onChange={(e) => setBroker(e.target.value as BrokerOption)}
    >
      <option value="auto">Auto-detect</option>
      <option value="mt4mt5">MT4 / MT5</option>
      <option value="exness">Exness</option>
    </select>
  </div>
  {broker === 'auto' ? (
    <p className={styles.formatDesc}>
      We&apos;ll detect your broker automatically. Supported: MT4/MT5, Exness.
    </p>
  ) : (
    <>
      <p className={styles.formatDesc}>
        Expected columns for {BROKER_LABELS[broker]}:
      </p>
      <div className={styles.columnList}>
        {BROKER_COLUMNS[broker].map((col) => (
          <span key={col} className={styles.colBadge}>{col}</span>
        ))}
      </div>
    </>
  )}
</div>
```

- [ ] **Step 6: Show detected broker in the result banner**

Find the `<div className={styles.resultHeader}>` block (around line 210) and update:

```tsx
<div className={styles.resultHeader}>
  <CheckCircle size={20} className={styles.successIcon} />
  <span className={styles.resultTitle}>
    Import complete{result.brokerLabel ? ` · ${result.brokerLabel}` : ''}
  </span>
</div>
```

- [ ] **Step 7: Update the page subtitle**

Replace the subtitle paragraph (line ~120):

```tsx
<p className={styles.subtitle}>
  Upload a CSV export from your broker. Supported formats: MT4/MT5, Exness.
</p>
```

- [ ] **Step 8: Add CSS for the new select + format header**

Append to `apps/web/src/app/dashboard/trades/import/page.module.css`:

```css
.formatHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}

.brokerSelect {
  padding: 6px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
}

.brokerSelect:hover { border-color: var(--border-secondary); }
.brokerSelect:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 9: Manual verify in the browser**

Start the dev server. Navigate to `/dashboard/trades/import`.

Verify:
- Default selection is `Auto-detect`; format card shows the auto-detect message.
- Switching to `MT4 / MT5` shows the MT4 column badges.
- Switching to `Exness` shows the Exness column badges (`ticket`, `opening_time_utc`, etc.).
- Drop the Exness file. Click import. Result banner shows `Import complete · Exness`.
- Visit `/dashboard/trades`; spot-check 3 imported rows against the source CSV (symbol/side/entry/exit/P&L).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/dashboard/trades/import/page.tsx apps/web/src/app/dashboard/trades/import/page.module.css
git commit -m "feat(import): add broker dropdown + detected-broker banner"
```

---

## Phase 6 — Final Verification

### Task 11: End-to-end verification

- [ ] **Step 1: All backend tests pass**

Run: `cd apps/api && npm test`
Expected: zero failures.

- [ ] **Step 2: TypeScript clean across the monorepo**

```bash
cd /Users/harry/Workspace/trading-journal && export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && nvm use 20.20.1
(cd apps/api && npx tsc --noEmit) && (cd apps/web && npx tsc --noEmit)
```
Expected: clean.

- [ ] **Step 3: Smoke matrix**

In the browser at `/dashboard/trades/import`, run through:

| Case | Broker selector | File | Expected |
|---|---|---|---|
| Exness auto | Auto-detect | Exness CSV | Detected: Exness, rows imported |
| Exness manual | Exness | Exness CSV | Detected: Exness, same result |
| MT4 auto | Auto-detect | MT4 CSV (use existing test fixture or a real export) | Detected: MT4/MT5, rows imported |
| Wrong manual | MT4 / MT5 | Exness CSV | Every row skipped with `Missing required fields…` (no crash) |
| Garbage CSV | Auto-detect | `Subject,Body\nfoo,bar` | Error: "Could not detect broker format…" |
| Empty body | (any) | `header_only.csv` | Error: "No data rows found in CSV" |

- [ ] **Step 4: Idempotency check**

Re-import the same Exness file. Verify the second import shows mostly `updated` rather than `created` (idempotency via `brokerTicketId` still works).

- [ ] **Step 5: Cleanup (if anything is off)**

Address any issues; commit each fix as `fix(import): …`.

---

## Out of Scope (recap)

- Interactive Brokers / ThinkorSwim / Tradezella / Tradovate adapters.
- XLSX import.
- Persisting `close_reason` / `Pips` / broker-specific metadata.
- `GET /trades/import/brokers` discovery endpoint.
- Multi-file batch import.
- Real-time broker API sync.
