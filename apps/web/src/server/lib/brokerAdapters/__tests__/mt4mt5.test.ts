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
