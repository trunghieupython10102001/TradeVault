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
