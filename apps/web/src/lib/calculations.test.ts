import { describe, it, expect } from 'vitest';
import {
  calculatePnl,
  calculatePnlPercent,
  calculateRMultiple,
  calculateMetrics,
  formatCurrency,
  formatPercent,
  formatNumber,
  type TradeForCalc,
} from './calculations';

const trade = (overrides: Partial<TradeForCalc> = {}): TradeForCalc => ({
  side: 'LONG',
  entryPrice: 100,
  exitPrice: 110,
  quantity: 10,
  commission: 0,
  ...overrides,
});

// ---------------------------------------------------------------------------
// calculatePnl
// ---------------------------------------------------------------------------
describe('calculatePnl', () => {
  it('LONG profit', () => {
    expect(calculatePnl(trade())).toBe(100);
  });

  it('LONG loss', () => {
    expect(calculatePnl(trade({ exitPrice: 90 }))).toBe(-100);
  });

  it('SHORT profit', () => {
    expect(calculatePnl(trade({ side: 'SHORT', entryPrice: 110, exitPrice: 100 }))).toBe(100);
  });

  it('SHORT loss', () => {
    expect(calculatePnl(trade({ side: 'SHORT', entryPrice: 100, exitPrice: 110 }))).toBe(-100);
  });

  it('deducts commission', () => {
    expect(calculatePnl(trade({ commission: 7 }))).toBe(93);
  });

  it('returns 0 when no exit price', () => {
    expect(calculatePnl(trade({ exitPrice: null }))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculatePnlPercent
// ---------------------------------------------------------------------------
describe('calculatePnlPercent', () => {
  it('10% gain on LONG', () => {
    expect(calculatePnlPercent(trade())).toBeCloseTo(10, 5);
  });

  it('10% loss on LONG', () => {
    expect(calculatePnlPercent(trade({ exitPrice: 90 }))).toBeCloseTo(-10, 5);
  });

  it('returns 0 when entry is 0', () => {
    expect(calculatePnlPercent(trade({ entryPrice: 0 }))).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateRMultiple
// ---------------------------------------------------------------------------
describe('calculateRMultiple', () => {
  it('2R winner on LONG', () => {
    expect(calculateRMultiple(trade({ entryPrice: 100, exitPrice: 102, stopLoss: 99 }))).toBeCloseTo(2, 5);
  });

  it('2R winner on SHORT', () => {
    expect(
      calculateRMultiple(trade({ side: 'SHORT', entryPrice: 100, exitPrice: 98, stopLoss: 101 }))
    ).toBeCloseTo(2, 5);
  });

  it('null when no stop loss', () => {
    expect(calculateRMultiple(trade({ stopLoss: null }))).toBeNull();
  });

  it('null when no exit price', () => {
    expect(calculateRMultiple(trade({ exitPrice: null, stopLoss: 95 }))).toBeNull();
  });

  it('null when stop == entry (zero risk)', () => {
    expect(calculateRMultiple(trade({ entryPrice: 100, exitPrice: 110, stopLoss: 100 }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calculateMetrics
// ---------------------------------------------------------------------------
describe('calculateMetrics', () => {
  it('all zeros for empty input', () => {
    const m = calculateMetrics([]);
    expect(m.totalTrades).toBe(0);
    expect(m.winRate).toBe(0);
    expect(m.totalPnl).toBe(0);
  });

  it('win rate, wins, and losses', () => {
    const m = calculateMetrics([{ pnl: 100 }, { pnl: -50 }, { pnl: 200 }, { pnl: -30 }]);
    expect(m.winRate).toBe(50);
    expect(m.winningTrades).toBe(2);
    expect(m.losingTrades).toBe(2);
  });

  it('totalPnl sums all trades', () => {
    expect(calculateMetrics([{ pnl: 100 }, { pnl: -40 }]).totalPnl).toBeCloseTo(60, 5);
  });

  it('profitFactor = grossProfit / grossLoss', () => {
    expect(calculateMetrics([{ pnl: 300 }, { pnl: -100 }]).profitFactor).toBeCloseTo(3, 5);
  });

  it('profitFactor Infinity when no losses', () => {
    expect(calculateMetrics([{ pnl: 100 }]).profitFactor).toBe(Infinity);
  });

  it('maxDrawdown detected correctly', () => {
    // equity: 100 → 200 (peak) → 150 → max DD = 50
    const m = calculateMetrics([{ pnl: 100 }, { pnl: 100 }, { pnl: -50 }]);
    expect(m.maxDrawdown).toBeCloseTo(50, 5);
    expect(m.maxDrawdownPercent).toBeCloseTo(25, 5);
  });

  it('bestTrade and worstTrade', () => {
    const m = calculateMetrics([{ pnl: 100 }, { pnl: -500 }, { pnl: 300 }]);
    expect(m.bestTrade).toBe(300);
    expect(m.worstTrade).toBe(-500);
  });

  it('expectancy is positive on profitable system', () => {
    const m = calculateMetrics([{ pnl: 200 }, { pnl: 200 }, { pnl: -50 }]);
    expect(m.expectancy).toBeGreaterThan(0);
  });

  it('avgRMultiple averages non-zero values', () => {
    const m = calculateMetrics([
      { pnl: 100, rMultiple: 3 },
      { pnl: -50, rMultiple: -1 },
      { pnl: 50, rMultiple: 0 },
    ]);
    expect(m.avgRMultiple).toBeCloseTo(1, 5);
  });

  it('sharpeRatio null for single trade', () => {
    expect(calculateMetrics([{ pnl: 100 }]).sharpeRatio).toBeNull();
  });

  it('sharpeRatio computed for varied dataset', () => {
    const m = calculateMetrics([{ pnl: 200 }, { pnl: -50 }, { pnl: 150 }, { pnl: -80 }]);
    expect(m.sharpeRatio).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('formats positive USD', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('formats negative USD', () => {
    expect(formatCurrency(-500)).toBe('-$500.00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('always two decimal places', () => {
    expect(formatCurrency(100)).toBe('$100.00');
    expect(formatCurrency(100.1)).toBe('$100.10');
  });

  it('uses thousands separator', () => {
    expect(formatCurrency(1000000)).toBe('$1,000,000.00');
  });

  it('supports non-USD currency', () => {
    const result = formatCurrency(100, 'EUR');
    expect(result).toMatch(/100/);
    expect(result).toMatch(/€|EUR/);
  });
});

// ---------------------------------------------------------------------------
// formatPercent
// ---------------------------------------------------------------------------
describe('formatPercent', () => {
  it('positive value gets + prefix', () => {
    expect(formatPercent(5.5)).toBe('+5.50%');
  });

  it('negative value keeps - sign', () => {
    expect(formatPercent(-3.25)).toBe('-3.25%');
  });

  it('zero gets + prefix', () => {
    expect(formatPercent(0)).toBe('+0.00%');
  });

  it('null returns em dash', () => {
    expect(formatPercent(null)).toBe('—');
  });

  it('undefined returns em dash', () => {
    expect(formatPercent(undefined)).toBe('—');
  });

  it('always two decimal places', () => {
    expect(formatPercent(10)).toBe('+10.00%');
    expect(formatPercent(-10)).toBe('-10.00%');
  });
});

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------
describe('formatNumber', () => {
  it('formats with default 2 decimals', () => {
    expect(formatNumber(1234.567)).toBe('1,234.57');
  });

  it('respects custom decimal places', () => {
    expect(formatNumber(1234.567, 0)).toBe('1,235');
    expect(formatNumber(1234.567, 4)).toBe('1,234.5670');
  });

  it('adds thousands separator', () => {
    expect(formatNumber(1000000, 0)).toBe('1,000,000');
  });

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0.00');
  });
});
