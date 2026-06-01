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
