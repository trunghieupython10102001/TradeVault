import { Router, Response } from 'express';
import { Prisma, prisma } from '@repo/database';
import { randomUUID } from 'crypto';
import { AuthRequest } from '../middleware/auth';
import { tradeSchema } from '../lib/validators';
import { calculateRMultiple } from '../lib/calculations';
import { parseCsv } from '../lib/csvParser';
import { detectAdapter, getAdapter, type NormalizedTrade } from '../lib/brokerAdapters';

const router = Router();
const IMPORT_BATCH_SIZE = 500;

function formatTrade(t: any) {
  return {
    ...t,
    entryPrice: Number(t.entryPrice),
    exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
    quantity: Number(t.quantity),
    stopLoss: t.stopLoss ? Number(t.stopLoss) : null,
    takeProfit: t.takeProfit ? Number(t.takeProfit) : null,
    commission: Number(t.commission),
    pnl: t.pnl ? Number(t.pnl) : null,
    pnlPercent: t.pnlPercent ? Number(t.pnlPercent) : null,
    rMultiple: t.rMultiple ? Number(t.rMultiple) : null,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// GET /trades
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { search, side, status, accountId, from, to, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const hasRange = typeof from === 'string' && typeof to === 'string';
    const take = hasRange ? 1000 : limitNum;
    const skip = hasRange ? 0 : (pageNum - 1) * limitNum;

    const where: any = { userId };

    if (search) {
      where.symbol = { contains: search as string, mode: 'insensitive' };
    }
    if (side && side !== 'ALL') {
      where.side = side as any;
    }
    if (status && status !== 'ALL') {
      where.status = status as any;
    }
    if (accountId && accountId !== 'ALL') {
      where.accountId = accountId as string;
    }
    // Date range filtering requires both bounds; a single bound falls back to normal pagination.
    if (hasRange) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        res.status(400).json({ error: 'Invalid date range. Use ISO dates for from and to.' });
        return;
      }
      where.exitDate = { gte: fromDate, lte: toDate };
    }

    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        orderBy: hasRange ? { exitDate: 'asc' } : { entryDate: 'desc' },
        skip,
        take,
        include: { images: true },
      }),
      prisma.trade.count({ where }),
    ]);

    res.json({
      data: trades.map(formatTrade),
      meta: {
        total,
        page: hasRange ? 1 : pageNum,
        limit: take,
        totalPages: hasRange ? 1 : Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});

// GET /trades/export — export trades (HTML or CSV)
router.get('/export', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const format = (req.query.format as string) || 'html';

    const trades = await prisma.trade.findMany({
      where: { userId },
      orderBy: { entryDate: 'desc' },
      include: { images: true },
    });

    if (format === 'csv') {
      const headers = [
        'Symbol', 'Side', 'Status', 'Entry Price', 'Exit Price', 'Quantity',
        'Commission', 'P&L', 'R-Multiple', 'Strategy', 'Timeframe', 'Rating',
        'Entry Date', 'Exit Date', 'Setup Description', 'Notes', 'Mistakes', 'Lessons',
      ];
      const escape = (v: any) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
      };
      const rows = trades.map((t: any) => [
        escape(t.symbol),
        escape(t.side),
        escape(t.status),
        escape(Number(t.entryPrice)),
        escape(t.exitPrice ? Number(t.exitPrice) : ''),
        escape(Number(t.quantity)),
        escape(Number(t.commission)),
        escape(t.pnl ? Number(t.pnl) : ''),
        escape(t.rMultiple ? Number(t.rMultiple) : ''),
        escape(t.strategy || ''),
        escape(t.timeframe || ''),
        escape(t.rating),
        escape(t.entryDate ? new Date(t.entryDate).toISOString() : ''),
        escape(t.exitDate ? new Date(t.exitDate).toISOString() : ''),
        escape(t.setupDescription || ''),
        escape(t.notes || ''),
        escape(t.mistakes || ''),
        escape(t.lessons || ''),
      ].join(','));
      const csv = [headers.join(','), ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="trades-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
      return;
    }

    res.json({ data: trades.map(formatTrade) });
  } catch (error) {
    console.error('Error exporting trades:', error);
    res.status(500).json({ error: 'Failed to export trades' });
  }
});

// GET /trades/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const trade = await prisma.trade.findUnique({
      where: { id, userId },
      include: { tags: { include: { tag: true } }, images: true },
    });

    if (!trade) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }

    res.json(formatTrade(trade));
  } catch (error) {
    console.error('Error fetching trade:', error);
    res.status(500).json({ error: 'Failed to fetch trade' });
  }
});

// POST /trades
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = tradeSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const data = result.data;

    // Get default account if accountId is not provided
    let accountId = data.accountId;
    if (!accountId) {
      const defaultAccount = await prisma.account.findFirst({
        where: { userId, isDefault: true },
        orderBy: { createdAt: 'asc' },
      });
      if (defaultAccount) {
        accountId = defaultAccount.id;
      } else {
        const newAccount = await prisma.account.create({
          data: { userId, name: 'Default Account', initialBalance: 0 },
        });
        accountId = newAccount.id;
      }
    }

    const grossPnl = req.body.grossPnl != null ? Number(req.body.grossPnl) : null;
    const commission = data.commission ?? 0;
    const pnl = (data.exitPrice && grossPnl != null) ? grossPnl - commission : null;
    const rMultipleRaw = (data.exitPrice && data.stopLoss) ? calculateRMultiple({
      side: data.side as 'LONG' | 'SHORT',
      entryPrice: data.entryPrice,
      exitPrice: data.exitPrice,
      quantity: data.quantity,
      stopLoss: data.stopLoss,
      commission: data.commission,
    }) : null;
    const rMultiple = (rMultipleRaw != null && Math.abs(rMultipleRaw) < 9999) ? rMultipleRaw : null;

    let tradeStatus = data.status as any;
    if (data.exitPrice && data.exitDate) {
      tradeStatus = 'CLOSED';
    }

    const images = req.body.images as { url: string; caption?: string | null; type?: string }[] | undefined;

    const trade = await prisma.trade.create({
      data: {
        userId,
        accountId: accountId!,
        symbol: data.symbol,
        side: data.side as any,
        status: tradeStatus as any,
        entryPrice: data.entryPrice,
        exitPrice: data.exitPrice,
        quantity: data.quantity,
        stopLoss: data.stopLoss,
        takeProfit: data.takeProfit,
        commission: data.commission,
        strategy: data.strategy,
        timeframe: data.timeframe,
        rating: data.rating,
        notes: data.notes,
        setupDescription: data.setupDescription,
        mistakes: data.mistakes,
        lessons: data.lessons,
        entryDate: data.entryDate,
        exitDate: data.exitDate,
        pnl,
        pnlPercent: null,
        rMultiple,
        tags: { create: data.tagIds.map(tagId => ({ tagId })) },
        ...(images && images.length > 0 ? {
          images: { create: images.map(img => ({ url: img.url, caption: img.caption || null, type: img.type || 'image' })) },
        } : {}),
      },
      include: { images: true },
    });

    res.json(trade);
  } catch (error) {
    console.error('Error creating trade:', error);
    res.status(500).json({ error: 'Failed to create trade' });
  }
});

async function handleTradeUpdate(req: AuthRequest, res: Response) {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const body = { ...req.body };

    // Extract images from body — they need separate handling
    const images = body.images as { url: string; caption?: string | null; type?: string }[] | undefined;
    delete body.images;
    // Remove tagIds too — not a direct Trade field
    delete body.tagIds;

    const currentTrade = await prisma.trade.findUnique({
      where: { id, userId },
    });

    if (!currentTrade) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }

    let pnl = currentTrade.pnl;
    let rMultiple = currentTrade.rMultiple;
    let status = currentTrade.status;

    // grossPnl is the broker-reported profit before commission
    const grossPnl = body.grossPnl != null ? Number(body.grossPnl) : null;
    delete body.grossPnl;

    const exitPrice = body.exitPrice !== undefined ? body.exitPrice : (currentTrade.exitPrice ? Number(currentTrade.exitPrice) : null);
    const commission = body.commission !== undefined ? Number(body.commission) : Number(currentTrade.commission);
    const stopLoss = body.stopLoss !== undefined ? body.stopLoss : (currentTrade.stopLoss ? Number(currentTrade.stopLoss) : null);

    if (exitPrice) {
      if (grossPnl != null) {
        pnl = (grossPnl - commission) as any;
      }
      status = 'CLOSED' as any;
    } else {
      pnl = null;
      status = 'OPEN' as any;
    }

    if (exitPrice && stopLoss) {
      const calcInput = {
        side: (body.side || currentTrade.side) as 'LONG' | 'SHORT',
        entryPrice: body.entryPrice !== undefined ? body.entryPrice : Number(currentTrade.entryPrice),
        exitPrice,
        quantity: body.quantity !== undefined ? body.quantity : Number(currentTrade.quantity),
        stopLoss,
        commission,
      };
      const rRaw = calculateRMultiple(calcInput);
      rMultiple = (rRaw != null && Math.abs(rRaw) < 9999) ? rRaw as any : null;
    } else {
      rMultiple = null;
    }

    if (body.status) status = body.status;

    // Coerce date strings to Date objects for Prisma
    if (body.entryDate && typeof body.entryDate === 'string') {
      body.entryDate = new Date(body.entryDate);
    }
    if (body.exitDate && typeof body.exitDate === 'string') {
      body.exitDate = new Date(body.exitDate);
    }

    // Handle images: delete existing and recreate
    if (images !== undefined) {
      await prisma.tradeImage.deleteMany({ where: { tradeId: id } });
      if (images.length > 0) {
        await prisma.tradeImage.createMany({
          data: images.map(img => ({
            tradeId: id,
            url: img.url,
            caption: img.caption || null,
            type: img.type || 'image',
          })),
        });
      }
    }

    const updatedTrade = await prisma.trade.update({
      where: { id, userId },
      data: { ...body, status, pnl, pnlPercent: null, rMultiple },
      include: { images: true },
    });

    res.json(formatTrade(updatedTrade));
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
}

// PATCH /trades/:id
router.patch('/:id', handleTradeUpdate);

// PUT /trades/:id
router.put('/:id', handleTradeUpdate);

// POST /trades/import
router.post('/import', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { csv, startingBalance, broker } = req.body as {
      csv: string;
      startingBalance?: number;
      broker?: string;
    };

    if (!csv || typeof csv !== 'string') {
      res.status(400).json({ error: 'CSV content is required' });
      return;
    }

    const { headers, rows } = parseCsv(csv);
    if (rows.length === 0) {
      res.status(400).json({ error: 'No data rows found in CSV' });
      return;
    }

    // Resolve adapter: explicit broker > auto-detect
    const adapter = broker ? getAdapter(broker) : detectAdapter(headers);
    if (broker && !adapter) {
      res.status(400).json({ error: `Unknown broker: ${broker}. Supported: mt4mt5, exness.` });
      return;
    }
    if (!adapter) {
      res.status(400).json({
        error: 'Could not detect broker format. Supported: MT4/MT5, Exness. Pick a broker manually.',
      });
      return;
    }

    // Get or create default account
    let account = await prisma.account.findFirst({
      where: { userId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) {
      account = await prisma.account.create({
        data: { userId, name: 'Default Account', initialBalance: 0, isDefault: true },
      });
    }
    const accountId = account.id;

    // Starting balance: explicit override > adapter auto-detect > unchanged
    let resolvedInitialBalance: number | null = null;
    if (startingBalance && startingBalance > 0) {
      resolvedInitialBalance = startingBalance;
    } else if (adapter.detectInitialBalance) {
      const detected = adapter.detectInitialBalance(rows);
      if (detected !== null && detected > 0) resolvedInitialBalance = detected;
    }
    if (resolvedInitialBalance !== null) {
      await prisma.account.update({
        where: { id: accountId },
        data: { initialBalance: resolvedInitialBalance },
      });
    }

    const parsedTrades: Array<{
      rowNum: number;
      brokerTicketId: string | null;
      data: {
        accountId: string;
        symbol: string;
        side: 'LONG' | 'SHORT';
        status: 'OPEN' | 'CLOSED';
        entryPrice: number;
        exitPrice: number | null;
        quantity: number;
        stopLoss: number | null;
        takeProfit: number | null;
        commission: number;
        pnl: number | null;
        pnlPercent: null;
        rMultiple: number | null;
        entryDate: Date;
        exitDate: Date | null;
      };
    }> = [];
    const skipped: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = i + 2;

      try {
        const parsed = adapter.parseRow(row);
        if ('skip' in parsed) {
          skipped.push({ row: rowNum, reason: parsed.reason });
          continue;
        }
        const t: NormalizedTrade = parsed;

        const tradeForCalc = {
          side: t.side,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          quantity: t.quantity,
          stopLoss: t.stopLoss,
          commission: t.commission,
        };

        const rMultipleRaw = (t.exitDate && t.stopLoss !== null && t.exitPrice !== null)
          ? calculateRMultiple({ ...tradeForCalc, exitPrice: t.exitPrice })
          : null;
        const rMultiple = (rMultipleRaw != null && Math.abs(rMultipleRaw) < 9999) ? rMultipleRaw : null;

        const tradeData = {
          accountId,
          symbol: t.symbol,
          side: t.side,
          status: t.exitDate ? 'CLOSED' as const : 'OPEN' as const,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          quantity: t.quantity,
          stopLoss: t.stopLoss,
          takeProfit: t.takeProfit,
          commission: t.commission,
          pnl: t.pnl,
          pnlPercent: null,
          rMultiple,
          entryDate: t.entryDate,
          exitDate: t.exitDate,
        };

        parsedTrades.push({ rowNum, brokerTicketId: t.brokerTicketId, data: tradeData });
      } catch (err: any) {
        skipped.push({ row: rowNum, reason: err.message || 'Unknown error' });
      }
    }

    const duplicateTickets = new Set<string>();
    const uniqueByTicket = new Map<string, (typeof parsedTrades)[number]>();
    const noTicketTrades: typeof parsedTrades = [];
    for (const parsedTrade of parsedTrades) {
      if (!parsedTrade.brokerTicketId) {
        noTicketTrades.push(parsedTrade);
        continue;
      }
      if (uniqueByTicket.has(parsedTrade.brokerTicketId)) duplicateTickets.add(parsedTrade.brokerTicketId);
      uniqueByTicket.set(parsedTrade.brokerTicketId, parsedTrade);
    }

    const uniqueTicketTrades = Array.from(uniqueByTicket.values());
    const existingTicketRows = uniqueTicketTrades.length > 0
      ? await prisma.trade.findMany({
          where: {
            userId,
            brokerTicketId: { in: uniqueTicketTrades.map((trade) => trade.brokerTicketId!) },
          },
          select: { brokerTicketId: true },
        })
      : [];
    const existingTickets = new Set(existingTicketRows.map((trade) => trade.brokerTicketId).filter(Boolean) as string[]);

    for (const batch of chunk(uniqueTicketTrades, IMPORT_BATCH_SIZE)) {
      const values = batch.map((trade) => {
        const d = trade.data;
        return Prisma.sql`(
          ${randomUUID()}, ${userId}, ${d.accountId}, ${trade.brokerTicketId}, ${d.symbol}, ${d.side}::"TradeSide", ${d.status}::"TradeStatus",
          ${d.entryPrice}, ${d.exitPrice}, ${d.quantity}, ${d.stopLoss}, ${d.takeProfit}, ${d.commission}, ${d.pnl}, ${d.pnlPercent}, ${d.rMultiple},
          ${d.entryDate}, ${d.exitDate}, NOW(), NOW()
        )`;
      });

      await prisma.$executeRaw`
        INSERT INTO "trades" (
          "id", "user_id", "account_id", "broker_ticket_id", "symbol", "side", "status",
          "entry_price", "exit_price", "quantity", "stop_loss", "take_profit", "commission", "pnl", "pnl_percent", "r_multiple",
          "entry_date", "exit_date", "created_at", "updated_at"
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT ("user_id", "broker_ticket_id") DO UPDATE SET
          "account_id" = EXCLUDED."account_id",
          "symbol" = EXCLUDED."symbol",
          "side" = EXCLUDED."side",
          "status" = EXCLUDED."status",
          "entry_price" = EXCLUDED."entry_price",
          "exit_price" = EXCLUDED."exit_price",
          "quantity" = EXCLUDED."quantity",
          "stop_loss" = EXCLUDED."stop_loss",
          "take_profit" = EXCLUDED."take_profit",
          "commission" = EXCLUDED."commission",
          "pnl" = EXCLUDED."pnl",
          "pnl_percent" = EXCLUDED."pnl_percent",
          "r_multiple" = EXCLUDED."r_multiple",
          "entry_date" = EXCLUDED."entry_date",
          "exit_date" = EXCLUDED."exit_date",
          "updated_at" = NOW()
      `;
    }

    if (noTicketTrades.length > 0) {
      await prisma.trade.createMany({
        data: noTicketTrades.map((trade) => ({ userId, ...trade.data })),
      });
    }

    const createdCount = uniqueTicketTrades.filter((trade) => !existingTickets.has(trade.brokerTicketId!)).length + noTicketTrades.length;
    const updatedCount = uniqueTicketTrades.filter((trade) => existingTickets.has(trade.brokerTicketId!)).length;

    res.json({
      success: true,
      broker: adapter.name,
      brokerLabel: adapter.displayName,
      imported: createdCount + updatedCount,
      created: createdCount,
      updated: updatedCount,
      duplicatesInFile: duplicateTickets.size,
      skipped: skipped.length,
      skippedDetails: skipped,
    });
  } catch (error) {
    console.error('Error importing trades:', error);
    res.status(500).json({ error: 'Failed to import trades' });
  }
});

// DELETE /trades/bulk
router.delete('/bulk', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { ids } = req.body as { ids: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    const { count } = await prisma.trade.deleteMany({
      where: { id: { in: ids }, userId },
    });

    res.json({ success: true, deleted: count });
  } catch (error) {
    console.error('Error bulk deleting trades:', error);
    res.status(500).json({ error: 'Failed to delete trades' });
  }
});

// DELETE /trades/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    await prisma.trade.delete({
      where: { id, userId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting trade:', error);
    res.status(500).json({ error: 'Failed to delete trade' });
  }
});

export default router;
