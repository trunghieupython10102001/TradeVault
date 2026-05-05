import { Router, Response } from 'express';
import { prisma } from '@repo/database';
import { AuthRequest } from '../middleware/auth';
import { subDays, startOfYear, getDay } from 'date-fns';

const router = Router();

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getPeriodStart(period: string): Date | null {
  const now = new Date();
  switch (period.toLowerCase()) {
    case '1w': return subDays(now, 7);
    case '1m': return subDays(now, 30);
    case '3m': return subDays(now, 90);
    case '6m': return subDays(now, 180);
    case 'ytd': return startOfYear(now);
    default: return null; // 'all'
  }
}

// GET /analytics?period=1w|1m|3m|6m|ytd|all
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const period = (req.query.period as string) || 'all';
    const periodStart = getPeriodStart(period);

    const where: any = { userId, status: 'CLOSED' };
    if (periodStart) {
      where.exitDate = { gte: periodStart };
    }

    const trades = await prisma.trade.findMany({
      where,
      orderBy: { exitDate: 'asc' },
      select: { id: true, pnl: true, strategy: true, symbol: true, exitDate: true },
    });

    const strategyMap: Record<string, { trades: number; wins: number; pnl: number }> = {};
    const symbolMap: Record<string, { trades: number; wins: number; pnl: number }> = {};
    const dayMap: Record<number, { trades: number; wins: number; pnl: number }> = {};

    let runningEquity = 0;
    let peak = 0;
    const drawdownPoints: number[] = [];

    for (const trade of trades) {
      const pnl = Number(trade.pnl) || 0;
      const isWin = pnl > 0;

      // By strategy
      const strat = trade.strategy || 'No Strategy';
      if (!strategyMap[strat]) strategyMap[strat] = { trades: 0, wins: 0, pnl: 0 };
      strategyMap[strat].trades++;
      if (isWin) strategyMap[strat].wins++;
      strategyMap[strat].pnl += pnl;

      // By symbol
      const sym = trade.symbol;
      if (!symbolMap[sym]) symbolMap[sym] = { trades: 0, wins: 0, pnl: 0 };
      symbolMap[sym].trades++;
      if (isWin) symbolMap[sym].wins++;
      symbolMap[sym].pnl += pnl;

      // By day of week
      if (trade.exitDate) {
        const dow = getDay(trade.exitDate);
        if (!dayMap[dow]) dayMap[dow] = { trades: 0, wins: 0, pnl: 0 };
        dayMap[dow].trades++;
        if (isWin) dayMap[dow].wins++;
        dayMap[dow].pnl += pnl;
      }

      // Drawdown calculation
      runningEquity += pnl;
      if (runningEquity > peak) peak = runningEquity;
      const dd = peak > 0 ? ((runningEquity - peak) / peak) * 100 : 0;
      drawdownPoints.push(Math.round(dd * 100) / 100);
    }

    const byStrategy = Object.entries(strategyMap)
      .map(([name, v]) => ({
        name,
        trades: v.trades,
        winRate: v.trades > 0 ? Math.round((v.wins / v.trades) * 1000) / 10 : 0,
        pnl: Math.round(v.pnl * 100) / 100,
      }))
      .sort((a, b) => b.pnl - a.pnl);

    // Top 8 symbols by absolute P&L
    const bySymbol = Object.entries(symbolMap)
      .map(([symbol, v]) => ({
        symbol,
        trades: v.trades,
        winRate: v.trades > 0 ? Math.round((v.wins / v.trades) * 1000) / 10 : 0,
        pnl: Math.round(v.pnl * 100) / 100,
      }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 8);

    // Mon–Fri in order, only days with data
    const byDay = ([1, 2, 3, 4, 5] as number[])
      .filter((d) => dayMap[d])
      .map((d) => ({
        day: DAY_NAMES[d]!,
        trades: dayMap[d]!.trades,
        winRate:
          dayMap[d]!.trades > 0
            ? Math.round((dayMap[d]!.wins / dayMap[d]!.trades) * 1000) / 10
            : 0,
        pnl: Math.round(dayMap[d]!.pnl * 100) / 100,
      }));

    const maxDrawdown =
      drawdownPoints.length > 0 ? Math.min(...drawdownPoints) : 0;

    res.json({
      byStrategy,
      bySymbol,
      byDay,
      drawdown: drawdownPoints,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      totalTrades: trades.length,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
