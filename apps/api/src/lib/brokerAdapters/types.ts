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
