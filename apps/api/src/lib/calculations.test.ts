import { describe, it, expect } from 'vitest';
import {
  calculatePnl,
  calculatePnlPercent,
  calculateRMultiple,
  calculateMetrics,
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
  it('LONG profit: (exit - entry) * qty', () => {
    expect(calculatePnl(trade({ entryPrice: 100, exitPrice: 110, quantity: 10 }))).toBe(100);
  });

  it('LONG loss: negative when exit < entry', () => {
    expect(calculatePnl(trade({ entryPrice: 100, exitPrice: 90, quantity: 10 }))).toBe(-100);
  });

  it('SHORT profit: (entry - exit) * qty', () => {
    expect(calculatePnl(trade({ side: 'SHORT', entryPrice: 110, exitPrice: 100, quantity: 10 }))).toBe(100);
  });

  it('SHORT loss: negative when exit > entry', () => {
    expect(calculatePnl(trade({ side: 'SHORT', entryPrice: 100, exitPrice: 110, quantity: 10 }))).toBe(-100);
  });

  it('deducts commission from gross P&L', () => {
    expect(calculatePnl(trade({ entryPrice: 100, exitPrice: 110, quantity: 10, commission: 5 }))).toBe(95);
  });

  it('returns 0 when exitPrice is null', () => {
    expect(calculatePnl(trade({ exitPrice: null }))).toBe(0);
  });

  it('returns 0 when exitPrice is undefined', () => {
    expect(calculatePnl(trade({ exitPrice: undefined }))).toBe(0);
  });

  it('handles Prisma Decimal-like objects', () => {
    const decimal = (n: number) => ({ toString: () => String(n), toNumber: () => n });
    expect(
      calculatePnl(trade({ entryPrice: decimal(100), exitPrice: decimal(110), quantity: decimal(10), commission: decimal(2) }))
    ).toBe(98);
  });

  it('handles string prices', () => {
    expect(calculatePnl(trade({ entryPrice: '100', exitPrice: '105', quantity: '4' }))).toBe(20);
  });

  it('breakeven trade (entry == exit) returns -commission', () => {
    expect(calculatePnl(trade({ entryPrice: 100, exitPrice: 100, quantity: 10, commission: 3 }))).toBe(-3);
  });
});

// ---------------------------------------------------------------------------
// calculatePnlPercent
// ---------------------------------------------------------------------------
describe('calculatePnlPercent', () => {
  it('LONG 10% gain', () => {
    expect(calculatePnlPercent(trade({ entryPrice: 100, exitPrice: 110, quantity: 10 }))).toBeCloseTo(10, 5);
  });

  it('LONG 10% loss', () => {
    expect(calculatePnlPercent(trade({ entryPrice: 100, exitPrice: 90, quantity: 10 }))).toBeCloseTo(-10, 5);
  });

  it('returns 0 when entry is 0', () => {
    expect(calculatePnlPercent(trade({ entryPrice: 0 }))).toBe(0);
  });

  it('returns 0 when quantity is 0', () => {
    expect(calculatePnlPercent(trade({ quantity: 0 }))).toBe(0);
  });

  it('commission reduces percent return', () => {
    // pnl = 100 - 5 = 95, cost = 100*10 = 1000 → 9.5%
    expect(calculatePnlPercent(trade({ entryPrice: 100, exitPrice: 110, quantity: 10, commission: 5 }))).toBeCloseTo(9.5, 5);
  });
});

// ---------------------------------------------------------------------------
// calculateRMultiple
// ---------------------------------------------------------------------------
describe('calculateRMultiple', () => {
  it('LONG 2R winner', () => {
    expect(calculateRMultiple(trade({ entryPrice: 100, exitPrice: 102, stopLoss: 99 }))).toBeCloseTo(2, 5);
  });

  it('LONG 1R loser (hit stop exactly)', () => {
    expect(calculateRMultiple(trade({ entryPrice: 100, exitPrice: 99, stopLoss: 99 }))).toBeCloseTo(-1, 5);
  });

  it('SHORT 2R winner', () => {
    expect(
      calculateRMultiple(trade({ side: 'SHORT', entryPrice: 100, exitPrice: 98, stopLoss: 101 }))
    ).toBeCloseTo(2, 5);
  });

  it('SHORT 1R loser', () => {
    expect(
      calculateRMultiple(trade({ side: 'SHORT', entryPrice: 100, exitPrice: 101, stopLoss: 101 }))
    ).toBeCloseTo(-1, 5);
  });

  it('returns null when stopLoss is missing', () => {
    expect(calculateRMultiple(trade({ stopLoss: null }))).toBeNull();
    expect(calculateRMultiple(trade({ stopLoss: undefined }))).toBeNull();
  });

  it('returns null when exit price is missing', () => {
    expect(calculateRMultiple(trade({ exitPrice: null, stopLoss: 95 }))).toBeNull();
  });

  it('returns null when stopLoss == entry (zero risk)', () => {
    expect(calculateRMultiple(trade({ entryPrice: 100, exitPrice: 110, stopLoss: 100 }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// calculateMetrics
// ---------------------------------------------------------------------------
describe('calculateMetrics', () => {
  describe('empty dataset', () => {
    it('returns all-zero structure', () => {
      const m = calculateMetrics([]);
      expect(m.totalTrades).toBe(0);
      expect(m.winRate).toBe(0);
      expect(m.totalPnl).toBe(0);
      expect(m.profitFactor).toBe(0);
      expect(m.maxDrawdown).toBe(0);
      expect(m.avgRMultiple).toBeNull();
      expect(m.sharpeRatio).toBeNull();
    });
  });

  describe('win / loss counts', () => {
    it('100% win rate when all trades profitable', () => {
      const m = calculateMetrics([{ pnl: 100 }, { pnl: 200 }, { pnl: 50 }]);
      expect(m.winRate).toBe(100);
      expect(m.winningTrades).toBe(3);
      expect(m.losingTrades).toBe(0);
    });

    it('0% win rate when all trades losing', () => {
      const m = calculateMetrics([{ pnl: -100 }, { pnl: -50 }]);
      expect(m.winRate).toBe(0);
      expect(m.losingTrades).toBe(2);
    });

    it('50% win rate on mixed trades', () => {
      const m = calculateMetrics([{ pnl: 100 }, { pnl: -50 }, { pnl: 200 }, { pnl: -30 }]);
      expect(m.winRate).toBe(50);
    });
  });

  describe('totals and averages', () => {
    it('sums totalPnl correctly', () => {
      const m = calculateMetrics([{ pnl: 100 }, { pnl: -50 }, { pnl: 200 }]);
      expect(m.totalPnl).toBeCloseTo(250, 5);
    });

    it('computes avgPnl', () => {
      const m = calculateMetrics([{ pnl: 100 }, { pnl: -50 }, { pnl: 200 }]);
      expect(m.avgPnl).toBeCloseTo(250 / 3, 5);
    });

    it('computes avgWin and avgLoss', () => {
      const m = calculateMetrics([{ pnl: 100 }, { pnl: 200 }, { pnl: -60 }, { pnl: -40 }]);
      expect(m.avgWin).toBeCloseTo(150, 5);
      expect(m.avgLoss).toBeCloseTo(50, 5);
    });

    it('avgLoss is always positive', () => {
      const m = calculateMetrics([{ pnl: -100 }, { pnl: -200 }]);
      expect(m.avgLoss).toBeGreaterThan(0);
    });
  });

  describe('profitFactor', () => {
    it('grossProfit / grossLoss', () => {
      const m = calculateMetrics([{ pnl: 300 }, { pnl: -100 }]);
      expect(m.profitFactor).toBeCloseTo(3, 5);
    });

    it('Infinity when no losses', () => {
      expect(calculateMetrics([{ pnl: 100 }, { pnl: 200 }]).profitFactor).toBe(Infinity);
    });

    it('0 when no wins and no losses (all zero pnl)', () => {
      expect(calculateMetrics([{ pnl: 0 }]).profitFactor).toBe(0);
    });
  });

  describe('maxDrawdown', () => {
    it('detects drawdown after peak', () => {
      // equity: 100 → 200 (peak) → 150 → DD=50
      const m = calculateMetrics([{ pnl: 100 }, { pnl: 100 }, { pnl: -50 }]);
      expect(m.maxDrawdown).toBeCloseTo(50, 5);
      expect(m.maxDrawdownPercent).toBeCloseTo((50 / 200) * 100, 5);
    });

    it('0 drawdown when all trades profitable', () => {
      const m = calculateMetrics([{ pnl: 100 }, { pnl: 50 }]);
      expect(m.maxDrawdown).toBe(0);
      expect(m.maxDrawdownPercent).toBe(0);
    });

    it('uses worst consecutive drawdown, not just first loss', () => {
      // equity: 100 → 50 (DD=50) → 250 (peak) → 100 (DD=150) → largest DD=150
      const m = calculateMetrics([{ pnl: 100 }, { pnl: -50 }, { pnl: 200 }, { pnl: -150 }]);
      expect(m.maxDrawdown).toBeCloseTo(150, 5);
    });
  });

  describe('best / worst trade', () => {
    it('identifies bestTrade and worstTrade', () => {
      const m = calculateMetrics([{ pnl: 100 }, { pnl: -500 }, { pnl: 300 }]);
      expect(m.bestTrade).toBe(300);
      expect(m.worstTrade).toBe(-500);
    });
  });

  describe('expectancy', () => {
    it('(winRate * avgWin) - (lossRate * avgLoss)', () => {
      // 2 wins of $100, 1 loss of $60
      const m = calculateMetrics([{ pnl: 100 }, { pnl: 100 }, { pnl: -60 }]);
      const expected = (2 / 3) * 100 - (1 / 3) * 60;
      expect(m.expectancy).toBeCloseTo(expected, 5);
    });

    it('positive expectancy on profitable system', () => {
      const m = calculateMetrics([{ pnl: 200 }, { pnl: 200 }, { pnl: -50 }]);
      expect(m.expectancy).toBeGreaterThan(0);
    });
  });

  describe('avgRMultiple', () => {
    it('averages non-zero R values only', () => {
      const trades = [
        { pnl: 100, rMultiple: 2 },
        { pnl: -50, rMultiple: -1 },
        { pnl: 50, rMultiple: 0 }, // filtered out
      ];
      expect(calculateMetrics(trades).avgRMultiple).toBeCloseTo(0.5, 5);
    });

    it('null when all R values are zero or missing', () => {
      const trades = [{ pnl: 100, rMultiple: 0 }, { pnl: -50 }];
      expect(calculateMetrics(trades).avgRMultiple).toBeNull();
    });
  });

  describe('sharpeRatio', () => {
    it('null for single trade', () => {
      expect(calculateMetrics([{ pnl: 100 }]).sharpeRatio).toBeNull();
    });

    it('null when all trades have identical P&L (zero std dev)', () => {
      expect(
        calculateMetrics([{ pnl: 100 }, { pnl: 100 }, { pnl: 100 }]).sharpeRatio
      ).toBeNull();
    });

    it('computed (non-null) for varied multi-trade dataset', () => {
      const trades = [{ pnl: 200 }, { pnl: -50 }, { pnl: 150 }, { pnl: -80 }];
      expect(calculateMetrics(trades).sharpeRatio).not.toBeNull();
    });

    it('uses daily P&L grouping when 20+ trading days available', () => {
      const trades = Array.from({ length: 25 }, (_, i) => ({
        pnl: i % 3 === 0 ? -40 : 100,
        exitDate: new Date(2024, 0, i + 1),
      }));
      const m = calculateMetrics(trades);
      expect(m.sharpeRatio).not.toBeNull();
      expect(typeof m.sharpeRatio).toBe('number');
    });

    it('positive sharpe for consistently profitable trades', () => {
      const trades = Array.from({ length: 5 }, (_, i) => ({
        pnl: 100 + i * 10,
      }));
      const m = calculateMetrics(trades);
      expect(m.sharpeRatio).not.toBeNull();
      expect(m.sharpeRatio!).toBeGreaterThan(0);
    });
  });

  describe('Decimal-like values', () => {
    it('accepts Prisma Decimal-like pnl objects', () => {
      const decimal = (n: number) => ({ toString: () => String(n), toNumber: () => n });
      const m = calculateMetrics([{ pnl: decimal(200) }, { pnl: decimal(-50) }]);
      expect(m.totalPnl).toBeCloseTo(150, 5);
      expect(m.winRate).toBe(50);
    });
  });
});
