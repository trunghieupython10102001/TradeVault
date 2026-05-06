import { Router, Response } from 'express';
import { prisma } from '@repo/database';
import { AuthRequest } from '../middleware/auth';
import { calculateMetrics } from '../lib/calculations';
import { subDays, startOfYear, getDay, getHours } from 'date-fns';

const router = Router();

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SESSION_ORDER = ['Asian', 'London', 'New York', 'Off Hours'] as const;

function getPeriodStart(period: string): Date | null {
  const now = new Date();
  switch (period.toLowerCase()) {
    case '1w': return subDays(now, 7);
    case '1m': return subDays(now, 30);
    case '3m': return subDays(now, 90);
    case '6m': return subDays(now, 180);
    case 'ytd': return startOfYear(now);
    default: return null;
  }
}

function getSession(hour: number): typeof SESSION_ORDER[number] {
  if (hour >= 0 && hour < 7) return 'Asian';
  if (hour >= 7 && hour < 12) return 'London';
  if (hour >= 12 && hour < 21) return 'New York';
  return 'Off Hours';
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// GET /analytics?period=1w|1m|3m|6m|ytd|all
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const period = (req.query.period as string) || 'all';
    const periodStart = getPeriodStart(period);

    const where: any = { userId, status: 'CLOSED' };
    if (periodStart) where.exitDate = { gte: periodStart };

    const [trades, account] = await Promise.all([
      prisma.trade.findMany({
        where,
        orderBy: { exitDate: 'asc' },
        select: {
          id: true,
          pnl: true,
          rMultiple: true,
          strategy: true,
          symbol: true,
          quantity: true,
          entryDate: true,
          exitDate: true,
        },
      }),
      prisma.account.findFirst({
        where: { userId, isDefault: true },
        select: { initialBalance: true },
      }),
    ]);

    const initialBalance = Number(account?.initialBalance ?? 0);

    // Aggregation maps
    const strategyMap: Record<string, { trades: number; wins: number; pnl: number }> = {};
    const symbolMap: Record<string, { trades: number; wins: number; pnl: number }> = {};
    const dayMap: Record<number, { trades: number; wins: number; pnl: number }> = {};
    const sessionMap: Record<string, { trades: number; wins: number; pnl: number; lots: number }> = {};
    const hourMap: Record<number, { trades: number; wins: number; pnl: number }> = {};

    let runningEquity = 0;
    let peak = 0;
    const drawdownPoints: number[] = [];

    for (const trade of trades) {
      const pnl = Number(trade.pnl) || 0;
      const isWin = pnl > 0;
      const lots = Number(trade.quantity) || 0;

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

      // By session & hour (from entryDate)
      if (trade.entryDate) {
        const hour = getHours(trade.entryDate);
        const session = getSession(hour);

        if (!sessionMap[session]) sessionMap[session] = { trades: 0, wins: 0, pnl: 0, lots: 0 };
        sessionMap[session].trades++;
        if (isWin) sessionMap[session].wins++;
        sessionMap[session].pnl += pnl;
        sessionMap[session].lots += lots;

        if (!hourMap[hour]) hourMap[hour] = { trades: 0, wins: 0, pnl: 0 };
        hourMap[hour].trades++;
        if (isWin) hourMap[hour].wins++;
        hourMap[hour].pnl += pnl;
      }

      // Drawdown
      runningEquity += pnl;
      if (runningEquity > peak) peak = runningEquity;
      const dd = peak > 0 ? ((runningEquity - peak) / peak) * 100 : 0;
      drawdownPoints.push(round2(dd));
    }

    // Statistics panel metrics
    const metrics = calculateMetrics(
      trades.map((t) => ({
        pnl: Number(t.pnl),
        rMultiple: t.rMultiple ? Number(t.rMultiple) : null,
        exitDate: t.exitDate,
      }))
    );
    const totalLots = round2(trades.reduce((s, t) => s + (Number(t.quantity) || 0), 0));
    const equity = round2(initialBalance + metrics.totalPnl);

    const stats = {
      equity,
      balance: equity,
      winRate: round2(metrics.winRate),
      avgWin: round2(metrics.avgWin),
      avgLoss: round2(-metrics.avgLoss),
      totalTrades: metrics.totalTrades,
      totalLots,
      sharpeRatio: metrics.sharpeRatio !== null ? round2(metrics.sharpeRatio) : null,
      avgRMultiple: metrics.avgRMultiple !== null ? round2(metrics.avgRMultiple) : null,
      expectancy: round2(metrics.expectancy),
      profitFactor: metrics.profitFactor === Infinity ? null : round2(metrics.profitFactor),
      maxDrawdown: round2(metrics.maxDrawdown),
      maxDrawdownPercent: round2(metrics.maxDrawdownPercent),
      bestTrade: round2(metrics.bestTrade),
      worstTrade: round2(metrics.worstTrade),
      totalPnl: round2(metrics.totalPnl),
    };

    // By strategy
    const byStrategy = Object.entries(strategyMap)
      .map(([name, v]) => ({
        name,
        trades: v.trades,
        winRate: v.trades > 0 ? round2((v.wins / v.trades) * 100) : 0,
        pnl: round2(v.pnl),
      }))
      .sort((a, b) => b.pnl - a.pnl);

    // Top 8 symbols by absolute P&L
    const bySymbol = Object.entries(symbolMap)
      .map(([symbol, v]) => ({
        symbol,
        trades: v.trades,
        winRate: v.trades > 0 ? round2((v.wins / v.trades) * 100) : 0,
        pnl: round2(v.pnl),
      }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 8);

    // Mon–Fri in order
    const byDay = ([1, 2, 3, 4, 5] as number[])
      .filter((d) => dayMap[d])
      .map((d) => ({
        day: DAY_NAMES[d]!,
        trades: dayMap[d]!.trades,
        winRate: dayMap[d]!.trades > 0 ? round2((dayMap[d]!.wins / dayMap[d]!.trades) * 100) : 0,
        pnl: round2(dayMap[d]!.pnl),
      }));

    // By session
    const bySession = SESSION_ORDER
      .filter((s) => sessionMap[s])
      .map((s) => ({
        session: s,
        trades: sessionMap[s]!.trades,
        winRate: sessionMap[s]!.trades > 0 ? round2((sessionMap[s]!.wins / sessionMap[s]!.trades) * 100) : 0,
        pnl: round2(sessionMap[s]!.pnl),
        lots: round2(sessionMap[s]!.lots),
      }));

    // By hour (0–23), only hours with trades
    const byHour = Array.from({ length: 24 }, (_, h) => {
      const hd = hourMap[h];
      if (!hd) return null;
      return {
        hour: h,
        trades: hd.trades,
        winRate: hd.trades > 0 ? round2((hd.wins / hd.trades) * 100) : 0,
        pnl: round2(hd.pnl),
      };
    }).filter(Boolean);

    const maxDrawdown = drawdownPoints.length > 0 ? Math.min(...drawdownPoints) : 0;

    res.json({
      stats,
      byStrategy,
      bySymbol,
      byDay,
      bySession,
      byHour,
      drawdown: drawdownPoints,
      maxDrawdown: round2(maxDrawdown),
      totalTrades: trades.length,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
