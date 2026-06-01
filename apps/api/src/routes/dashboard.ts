import { Router, Request, Response } from 'express';
import { prisma } from '@repo/database';
import { subDays, format } from 'date-fns';
import { requireAuth } from '../middleware/auth';
import { calculateMetrics } from '../lib/calculations';

const router = Router();
router.use(requireAuth);

type DashboardTrade = {
  entryPrice?: unknown;
  exitPrice?: unknown;
  quantity?: unknown;
  pnl: unknown;
  pnlPercent?: unknown;
  rMultiple: unknown;
  exitDate: Date | null;
};

// GET /api/dashboard
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const trades = await prisma.trade.findMany({
      where: { userId, status: 'CLOSED' },
      orderBy: { exitDate: 'asc' },
    }) as DashboardTrade[];

    const recentTrades = await prisma.trade.findMany({
      where: { userId },
      orderBy: { entryDate: 'desc' },
      take: 5,
    }) as DashboardTrade[];

    const account = await prisma.account.findFirst({
      where: { userId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    const initialBalance = Number(account?.initialBalance ?? 0);

    const metrics = calculateMetrics(
      trades.map((trade: DashboardTrade) => ({
        pnl: Number(trade.pnl),
        rMultiple: trade.rMultiple ? Number(trade.rMultiple) : null,
        exitDate: trade.exitDate,
      })),
      initialBalance
    );

    let cumulativePnl = initialBalance;
    const equityCurve = trades.map((trade: DashboardTrade) => {
      cumulativePnl += Number(trade.pnl);
      return {
        date: trade.exitDate ? format(trade.exitDate, 'yyyy-MM-dd') : '',
        equity: cumulativePnl,
      };
    });

    const dailyPnls: Record<string, number> = {};
    const thirtyDaysAgo = subDays(new Date(), 30);
    for (const trade of trades) {
      if (trade.exitDate && trade.exitDate >= thirtyDaysAgo) {
        const dateStr = format(trade.exitDate, 'yyyy-MM-dd');
        dailyPnls[dateStr] = (dailyPnls[dateStr] || 0) + Number(trade.pnl);
      }
    }

    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentStreak = 0;
    let lastIsWin: boolean | null = null;
    for (const trade of trades) {
      const isWin = Number(trade.pnl) > 0;
      currentStreak = lastIsWin === null || isWin === lastIsWin ? currentStreak + 1 : 1;
      lastIsWin = isWin;
      if (isWin && currentStreak > maxWinStreak) maxWinStreak = currentStreak;
      if (!isWin && currentStreak > maxLossStreak) maxLossStreak = currentStreak;
    }

    res.json({
      summary: { ...metrics, maxWinStreak, maxLossStreak },
      equityCurve,
      dailyPnl: Object.entries(dailyPnls)
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      recentTrades: recentTrades.map((trade: DashboardTrade) => ({
        ...trade,
        entryPrice: Number(trade.entryPrice),
        exitPrice: trade.exitPrice ? Number(trade.exitPrice) : null,
        quantity: Number(trade.quantity),
        pnl: trade.pnl ? Number(trade.pnl) : null,
        pnlPercent: trade.pnlPercent ? Number(trade.pnlPercent) : null,
      })),
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;
