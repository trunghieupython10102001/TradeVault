import { describe, it, expect } from 'vitest';
import { adapters, detectAdapter, getAdapter } from '..';

describe('broker adapter registry', () => {
  it('exposes the built-in adapters', () => {
    const names = adapters.map((a) => a.name).sort();
    expect(names).toEqual(['exness', 'mt4mt5', 'mt5report']);
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
