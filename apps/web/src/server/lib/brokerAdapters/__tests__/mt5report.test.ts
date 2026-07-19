import { describe, it, expect } from 'vitest';
import { mt5reportAdapter, isMt5HistoryReport, extractMt5PositionsCsv } from '../mt5report';
import { detectAdapter } from '..';
import { parseCsv } from '../../csvParser';

// Mirrors a native MT5 "Trade History Report" (ReportHistory-*.csv): metadata
// block, a Positions section with space-separated / zero-padded numbers, then
// an Orders section that must NOT bleed into the parsed trades.
const REPORT = `"Trade History Report","","","","","","","","","","","","","",""
"Name:","","","Demo","","","","","","","","","","",""
"Account:","","","1754416 (USD)","","","","","","","","","","",""
"Positions","","","","","","","","","","","","","",""
"Time","Position","Symbol","Type","Volume","Price","S / L","T / P","Time","Price","Commission","Swap","Profit","",""
"2026.07.01 15:41:26","39342040","XAUUSD","sell","1","4 100.43","","","2026.07.01 15:44:18","4 095.35","-0 006.00","0.00","0 508.00","",""
"2026.07.01 15:47:46","39344355","XAUUSD","buy","0.5","4 093.43","","","2026.07.01 15:57:15","4 093.69","-0 003.00","0.00","0 026.00","",""
"Orders","","","","","","","","","","","","","",""
"Open Time","Order","Symbol","Type","Volume","Price","S / L","T / P","Time","State","","Comment","","",""
"2026.07.01 15:41:26","39342040","XAUUSD","sell","1 / 1","market","","","2026.07.01 15:41:26","filled","","","","",""`;

describe('MT5 history report preprocessing', () => {
  it('recognizes the report header', () => {
    expect(isMt5HistoryReport(REPORT)).toBe(true);
    expect(isMt5HistoryReport('Ticket,Open,Type\n1,x,buy')).toBe(false);
  });

  it('extracts only the Positions section (drops metadata and Orders)', () => {
    const { rows } = parseCsv(extractMt5PositionsCsv(REPORT));
    expect(rows).toHaveLength(2); // two positions, no Orders rows
  });

  it('auto-detects the mt5report adapter from the Positions header', () => {
    const { headers } = parseCsv(extractMt5PositionsCsv(REPORT));
    expect(detectAdapter(headers)?.name).toBe('mt5report');
  });
});

describe('mt5reportAdapter.parseRow', () => {
  it('parses a winning sell with space-separated / zero-padded numbers', () => {
    const { rows } = parseCsv(extractMt5PositionsCsv(REPORT));
    const result = mt5reportAdapter.parseRow(rows[0]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.symbol).toBe('XAUUSD');
    expect(result.side).toBe('SHORT');
    expect(result.entryPrice).toBe(4100.43);
    expect(result.exitPrice).toBe(4095.35);
    expect(result.quantity).toBe(1);
    expect(result.brokerTicketId).toBe('39342040');
    expect(result.commission).toBe(6); // |-6| + |0|
    expect(result.pnl).toBeCloseTo(508 + 0 + -6); // profit + swap + commission
    expect(result.entryDate.toISOString()).toBe(new Date('2026-07-01T15:41:26').toISOString());
  });

  it('parses a fractional-lot buy', () => {
    const { rows } = parseCsv(extractMt5PositionsCsv(REPORT));
    const result = mt5reportAdapter.parseRow(rows[1]!);
    if ('skip' in result) throw new Error('expected non-skip');
    expect(result.side).toBe('LONG');
    expect(result.quantity).toBe(0.5);
    expect(result.commission).toBe(3);
    expect(result.pnl).toBeCloseTo(26 + 0 + -3);
  });
});
