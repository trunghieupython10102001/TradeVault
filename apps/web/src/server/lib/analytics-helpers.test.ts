import { describe, expect, it } from 'vitest';
import { aggregateByDayHour } from './analytics-helpers';

describe('aggregateByDayHour', () => {
  it('aggregates trades by entry day and hour', () => {
    const rows = aggregateByDayHour([
      { entryDate: new Date(2026, 4, 11, 9, 15), pnl: 100 },
      { entryDate: new Date(2026, 4, 11, 9, 45), pnl: -50 },
      { entryDate: new Date(2026, 4, 12, 10, 0), pnl: 25 },
    ]);

    expect(rows).toContainEqual({ day: 1, hour: 9, trades: 2, winRate: 50, pnl: 50 });
    expect(rows).toContainEqual({ day: 2, hour: 10, trades: 1, winRate: 100, pnl: 25 });
  });
});
