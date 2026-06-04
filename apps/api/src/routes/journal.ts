import { Router, Request, Response } from 'express';
import { prisma } from '@repo/database';
import { requireAuth } from '../middleware/auth';
import { journalSchema } from '../lib/validators';

const router = Router();
router.use(requireAuth);

// GET /api/journal
router.get('/', async (req: Request, res: Response) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { userId: req.userId },
      orderBy: { entryDate: 'desc' },
      include: {
        trades: {
          include: {
            trade: {
              select: { id: true, symbol: true, side: true, pnl: true, entryDate: true, exitDate: true },
            },
          },
        },
      },
    });
    const result = entries.map((e) => ({
      ...e,
      linkedTrades: e.trades.map((t) => t.trade),
      trades: undefined,
    }));
    res.json(result);
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// POST /api/journal
router.post('/', async (req: Request, res: Response) => {
  try {
    const result = journalSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }
    const { entryDate, periodType, content, mood, confidenceLevel, tradeIds } = result.data;

    const entry = await prisma.journalEntry.upsert({
      where: { userId_periodType_entryDate: { userId: req.userId!, periodType, entryDate } },
      update: { content, mood, confidenceLevel },
      create: { userId: req.userId!, entryDate, periodType, content, mood, confidenceLevel },
    });

    await prisma.journalTrade.deleteMany({ where: { journalId: entry.id } });
    if (tradeIds.length > 0) {
      await prisma.journalTrade.createMany({
        data: tradeIds.map((tradeId) => ({ journalId: entry.id, tradeId })),
      });
    }

    const updated = await prisma.journalEntry.findUnique({
      where: { id: entry.id },
      include: {
        trades: {
          include: {
            trade: {
              select: { id: true, symbol: true, side: true, pnl: true, entryDate: true, exitDate: true },
            },
          },
        },
      },
    });
    res.json({ ...updated, linkedTrades: updated!.trades.map((t) => t.trade), trades: undefined });
  } catch (error) {
    console.error('Error saving journal entry:', error);
    res.status(500).json({ error: 'Failed to save journal entry' });
  }
});

// GET /api/journal/:id/trades
router.get('/:id/trades', async (req: Request, res: Response) => {
  try {
    const entry = await prisma.journalEntry.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!entry) { res.status(404).json({ error: 'Not found' }); return; }

    const start = new Date(entry.entryDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);

    if (entry.periodType === 'WEEK') {
      end.setDate(end.getDate() + 6);
    } else if (entry.periodType === 'MONTH') {
      end.setMonth(end.getMonth() + 1, 0);
    }
    end.setHours(23, 59, 59, 999);

    const trades = await prisma.trade.findMany({
      where: { userId: req.userId, entryDate: { gte: start, lte: end } },
      select: { id: true, symbol: true, side: true, pnl: true, entryDate: true, exitDate: true },
      orderBy: { entryDate: 'asc' },
    });
    res.json(trades);
  } catch (error) {
    console.error('Error fetching trades for journal:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

export default router;
