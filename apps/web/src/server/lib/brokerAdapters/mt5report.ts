import type { BrokerAdapter, ParseResult, Side } from './types';
import type { CsvRow } from '../csvParser';

// The native MT5 "Trade History Report" (ReportHistory-*.csv) is NOT a flat
// table: it starts with a metadata block, then several sections
// (Positions / Orders / Deals / Results). Only the "Positions" section holds
// round-trip trades. Numbers use a space as the thousands separator and are
// zero-padded, e.g. "4 100.43" -> 4100.43, "-0 006.00" -> -6.
//
// Positions columns:
//   0 Time(open) 1 Position(ticket) 2 Symbol 3 Type 4 Volume 5 Price(entry)
//   6 S/L 7 T/P 8 Time(close) 9 Price(exit) 10 Commission 11 Swap 12 Profit

const DATETIME_CELL = /^"?\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}/;

/** True when the raw CSV is a native MT5 Trade History Report. */
export function isMt5HistoryReport(text: string): boolean {
  const firstLine = text.split('\n', 1)[0] ?? '';
  return /trade history report/i.test(firstLine);
}

/**
 * Reduce a full MT5 history report to just the Positions section (column
 * header + data rows) so the generic CSV pipeline can consume it. Data rows
 * are the contiguous run of datetime-led lines after the "Positions" marker;
 * the next section ("Orders") stops the run.
 */
export function extractMt5PositionsCsv(text: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^"?Positions"?/.test(l.trim()));
  if (start === -1) return text;

  const headerLine = lines[start + 1] ?? '';
  const dataLines: string[] = [];
  for (let i = start + 2; i < lines.length; i++) {
    if (!DATETIME_CELL.test(lines[i]!.trim())) break;
    dataLines.push(lines[i]!);
  }
  return [headerLine, ...dataLines].join('\n');
}

/** Strip thousands-separator spaces then parse, e.g. "4 100.43" -> 4100.43. */
function num(raw: string | undefined): number {
  const cleaned = (raw ?? '').replace(/\s/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** MT5 timestamps look like "2026.07.01 15:41:26" (naive local time). */
function parseMt5DateTime(raw: string | undefined): Date | null {
  const m = (raw ?? '').trim().match(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const mt5reportAdapter: BrokerAdapter = {
  name: 'mt5report',
  displayName: 'MT5 History Report',
  expectedColumns: [
    'Time', 'Position', 'Symbol', 'Type', 'Volume', 'Price',
    'S / L', 'T / P', 'Time', 'Price', 'Commission', 'Swap', 'Profit',
  ],
  detect(lowerHeaders) {
    return ['position', 'symbol', 'type', 'volume', 'commission', 'profit']
      .every((h) => lowerHeaders.includes(h));
  },
  parseRow(row: CsvRow): ParseResult {
    const ticket = (row['_col_1'] ?? '').trim();
    const symbol = (row['_col_2'] ?? '').trim().toUpperCase();
    const type = (row['_col_3'] ?? '').trim().toLowerCase();
    const volume = num(row['_col_4']);
    const entryPrice = num(row['_col_5']);
    const sl = num(row['_col_6']);
    const tp = num(row['_col_7']);
    const exitPrice = num(row['_col_9']);
    const commission = num(row['_col_10']);
    const swap = num(row['_col_11']);
    const profit = num(row['_col_12']);

    const entryDate = parseMt5DateTime(row['_col_0']);
    const exitDate = parseMt5DateTime(row['_col_8']);

    if (!symbol || !entryDate || !entryPrice || !volume) {
      return { skip: true, reason: 'Missing required fields (symbol, open time, entry price, volume)' };
    }
    if (type !== 'buy' && type !== 'sell') {
      return { skip: true, reason: `Unknown trade type: "${type}"` };
    }

    const side: Side = type === 'buy' ? 'LONG' : 'SHORT';
    const hasExit = exitDate !== null;

    return {
      brokerTicketId: ticket || null,
      symbol,
      side,
      entryDate,
      exitDate,
      entryPrice,
      exitPrice: hasExit ? exitPrice : null,
      quantity: volume,
      stopLoss: sl > 0 ? sl : null,
      takeProfit: tp > 0 ? tp : null,
      commission: Math.abs(commission) + Math.abs(swap),
      pnl: hasExit ? profit + swap + commission : null,
    };
  },
};
