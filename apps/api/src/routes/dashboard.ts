import { Router, Response } from 'express';
import { prisma } from '@repo/database';
import { AuthRequest } from '../middleware/auth';
import { calculateMetrics } from '../lib/calculations';
import { subDays, format } from 'date-fns';

const router = Router();

// GET /dashboard
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    // Fetch all closed trades for metrics
    const trades = await prisma.trade.findMany({
      where: { userId, status: 'CLOSED' },
      orderBy: { exitDate: 'asc' },
    });

    // Fetch recent trades (last 5)
    const recentTrades = await prisma.trade.findMany({
      where: { userId },
      orderBy: { entryDate: 'desc' },
      take: 5,
    });

    // Fetch default account for initial balance
    const account = await prisma.account.findFirst({
      where: { userId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    const initialBalance = Number(account?.initialBalance ?? 0);

    const metrics = calculateMetrics(
      trades.map((t: any) => ({
        pnl: Number(t.pnl),
        rMultiple: t.rMultiple ? Number(t.rMultiple) : null,
        exitDate: t.exitDate,
      })),
      initialBalance
    );

    // Equity Curve (cumulative PnL starting from initial account balance)
    let cumulativePnl = initialBalance;
    const equityCurve = trades.map((t: any) => {
      cumulativePnl += Number(t.pnl);
      return {
        date: t.exitDate ? format(t.exitDate, 'yyyy-MM-dd') : '',
        equity: cumulativePnl,
      };
    });

    // Daily PnL for last 30 days
    const thirtyDaysAgo = subDays(new Date(), 30);
    const dailyPnls: Record<string, number> = {};

    trades.forEach((t: any) => {
      if (t.exitDate && t.exitDate >= thirtyDaysAgo) {
        const dateStr = format(t.exitDate, 'yyyy-MM-dd');
        dailyPnls[dateStr] = (dailyPnls[dateStr] || 0) + Number(t.pnl);
      }
    });

    const dailyPnlChart = Object.entries(dailyPnls)
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Consecutive win/loss streaks
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let currentStreak = 0;
    let lastIsWin: boolean | null = null;

    for (const t of trades) {
      const isWin = Number(t.pnl) > 0;
      if (lastIsWin === null || isWin === lastIsWin) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
      lastIsWin = isWin;
      if (isWin && currentStreak > maxWinStreak) maxWinStreak = currentStreak;
      if (!isWin && currentStreak > maxLossStreak) maxLossStreak = currentStreak;
    }

    res.json({
      summary: {
        ...metrics,
        maxWinStreak,
        maxLossStreak,
      },
      equityCurve,
      dailyPnl: dailyPnlChart,
      recentTrades: recentTrades.map((t: any) => ({
        ...t,
        entryPrice: Number(t.entryPrice),
        exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
        quantity: Number(t.quantity),
        pnl: t.pnl ? Number(t.pnl) : null,
        pnlPercent: t.pnlPercent ? Number(t.pnlPercent) : null,
      })),
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;
