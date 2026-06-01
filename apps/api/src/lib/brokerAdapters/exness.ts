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
