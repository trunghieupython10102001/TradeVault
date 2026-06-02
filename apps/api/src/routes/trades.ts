import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/client';
import { sqltag as sql, join } from '@prisma/client/runtime/client';
import { prisma } from '@repo/database';
import { requireAuth } from '../middleware/auth';
import { tradeSchema } from '../lib/validators';
import { calculateRMultiple } from '../lib/calculations';
import { parseCsv } from '../lib/csvParser';
import { detectAdapter, getAdapter, type NormalizedTrade } from '../lib/brokerAdapters';

const router = Router();
router.use(requireAuth);

// GET /api/trades/symbols
router.get('/symbols', async (req: Request, res: Response) => {
  try {
    const rows = await prisma.trade.findMany({
      where: { userId: req.userId },
      select: { symbol: true },
      distinct: ['symbol'],
      orderBy: { symbol: 'asc' },
    });
    res.json(rows.map((r) => r.symbol));
  } catch (error) {
    console.error('Error fetching symbols:', error);
    res.status(500).json({ error: 'Failed to fetch symbols' });
  }
});

const IMPORT_BATCH_SIZE = 500;

type TradeWithNumericFields = {
  entryPrice: unknown;
  exitPrice?: unknown;
  quantity: unknown;
  stopLoss?: unknown;
  takeProfit?: unknown;
  commission: unknown;
  pnl?: unknown;
  pnlPercent?: unknown;
  rMultiple?: unknown;
};

function formatTrade<T extends TradeWithNumericFields>(t: T) {
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

type ExportTrade = {
  symbol: string;
  side: string;
  status: string;
  entryPrice: unknown;
  exitPrice?: unknown;
  quantity: unknown;
  commission: unknown;
  pnl?: unknown;
  rMultiple?: unknown;
  strategy?: string | null;
  timeframe?: string | null;
  rating?: number | null;
  entryDate?: Date | string | null;
  exitDate?: Date | string | null;
  setupDescription?: string | null;
  notes?: string | null;
  mistakes?: string | null;
  lessons?: string | null;
};

type ParsedTrade = {
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
};

type ExistingTicketRow = {
  brokerTicketId: string | null;
};

// GET /api/trades/export  — must be before /:id
router.get('/export', async (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string) || 'html';
    const trades = await prisma.trade.findMany({
      where: { userId: req.userId },
      orderBy: { entryDate: 'desc' },
      include: { images: true },
    }) as ExportTrade[];

    if (format === 'csv') {
      const headers = [
        'Symbol', 'Side', 'Status', 'Entry Price', 'Exit Price', 'Quantity',
        'Commission', 'P&L', 'R-Multiple', 'Strategy', 'Timeframe', 'Rating',
        'Entry Date', 'Exit Date', 'Setup Description', 'Notes', 'Mistakes', 'Lessons',
      ];
      const escape = (v: unknown) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
      };
      const rows = trades.map((t: ExportTrade) => [
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
        escape(t.entryDate ? new Date(t.entryDate as string).toISOString() : ''),
        escape(t.exitDate ? new Date(t.exitDate as string).toISOString() : ''),
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

// DELETE /api/trades/bulk  — must be before /:id
router.delete('/bulk', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    const { count } = await prisma.trade.deleteMany({ where: { id: { in: ids }, userId: req.userId } });
    res.json({ success: true, deleted: count });
  } catch (error) {
    console.error('Error bulk deleting trades:', error);
    res.status(500).json({ error: 'Failed to delete trades' });
  }
});

// POST /api/trades/import  — must be before /:id
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { csv, startingBalance, broker, csvTimezoneOffset } = req.body as {
      csv: string;
      startingBalance?: number;
      broker?: string;
      csvTimezoneOffset?: number;
    };
    const shiftMs = typeof csvTimezoneOffset === 'number' ? csvTimezoneOffset * 3_600_000 : 0;
    const shiftDate = (d: Date | null): Date | null =>
      d && shiftMs ? new Date(d.getTime() - shiftMs) : d;

    if (!csv || typeof csv !== 'string') {
      res.status(400).json({ error: 'CSV content is required' });
      return;
    }

    const { headers, rows } = parseCsv(csv);
    if (rows.length === 0) {
      res.status(400).json({ error: 'No data rows found in CSV' });
      return;
    }

    const adapter = broker ? getAdapter(broker) : detectAdapter(headers);
    if (broker && !adapter) {
      res.status(400).json({ error: `Unknown broker: ${broker}. Supported: mt4mt5, exness.` });
      return;
    }
    if (!adapter) {
      res.status(400).json({ error: 'Could not detect broker format. Supported: MT4/MT5, Exness. Pick a broker manually.' });
      return;
    }

    let account = await prisma.account.findFirst({
      where: { userId: req.userId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) {
      account = await prisma.account.create({
        data: { userId: req.userId!, name: 'Default Account', initialBalance: 0, isDefault: true },
      });
    }
    const accountId = account.id;

    let resolvedInitialBalance: number | null = null;
    if (startingBalance && startingBalance > 0) {
      resolvedInitialBalance = startingBalance;
    } else if (adapter.detectInitialBalance) {
      const detected = adapter.detectInitialBalance(rows);
      if (detected !== null && detected > 0) resolvedInitialBalance = detected;
    }
    if (resolvedInitialBalance !== null) {
      await prisma.account.update({ where: { id: accountId }, data: { initialBalance: resolvedInitialBalance } });
    }

    const parsedTrades: ParsedTrade[] = [];
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
        const rMultipleRaw = t.exitDate && t.stopLoss !== null && t.exitPrice !== null
          ? calculateRMultiple({
              side: t.side,
              entryPrice: t.entryPrice,
              exitPrice: t.exitPrice,
              quantity: t.quantity,
              stopLoss: t.stopLoss,
              commission: t.commission,
            })
          : null;
        const rMultiple = rMultipleRaw != null && Math.abs(rMultipleRaw) < 9999 ? rMultipleRaw : null;

        parsedTrades.push({
          rowNum,
          brokerTicketId: t.brokerTicketId,
          data: {
            accountId,
            symbol: t.symbol,
            side: t.side,
            status: t.exitDate ? 'CLOSED' : 'OPEN',
            entryPrice: t.entryPrice,
            exitPrice: t.exitPrice,
            quantity: t.quantity,
            stopLoss: t.stopLoss,
            takeProfit: t.takeProfit,
            commission: t.commission,
            pnl: t.pnl,
            pnlPercent: null,
            rMultiple,
            entryDate: shiftDate(t.entryDate) ?? t.entryDate,
            exitDate: shiftDate(t.exitDate),
          },
        });
      } catch (err: unknown) {
        skipped.push({ row: rowNum, reason: err instanceof Error ? err.message : 'Unknown error' });
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
          where: { userId: req.userId, brokerTicketId: { in: uniqueTicketTrades.map((trade: ParsedTrade) => trade.brokerTicketId!) } },
          select: { brokerTicketId: true },
        }) as ExistingTicketRow[]
      : [];
    const existingTickets = new Set(existingTicketRows.map((trade: ExistingTicketRow) => trade.brokerTicketId).filter(Boolean) as string[]);

    for (const batch of chunk(uniqueTicketTrades, IMPORT_BATCH_SIZE)) {
      const values = batch.map((trade: ParsedTrade) => {
        const d = trade.data;
        return sql`(
          ${randomUUID()}, ${req.userId!}, ${d.accountId}, ${trade.brokerTicketId}, ${d.symbol}, ${d.side}::"TradeSide", ${d.status}::"TradeStatus",
          ${d.entryPrice}, ${d.exitPrice}, ${d.quantity}, ${d.stopLoss}, ${d.takeProfit}, ${d.commission}, ${d.pnl}, ${d.pnlPercent}, ${d.rMultiple},
          ${d.entryDate}, ${d.exitDate}, NOW(), NOW()
        )`;
      });

      await prisma.$executeRaw`
        INSERT INTO "trades" (
          "id", "user_id", "account_id", "broker_ticket_id", "symbol", "side", "status",
          "entry_price", "exit_price", "quantity", "stop_loss", "take_profit", "commission", "pnl", "pnl_percent", "r_multiple",
          "entry_date", "exit_date", "created_at", "updated_at"
        ) VALUES ${join(values)}
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
      await prisma.trade.createMany({ data: noTicketTrades.map((trade: ParsedTrade) => ({ userId: req.userId!, ...trade.data })) });
    }

    const createdCount = uniqueTicketTrades.filter((trade: ParsedTrade) => !existingTickets.has(trade.brokerTicketId!)).length + noTicketTrades.length;
    const updatedCount = uniqueTicketTrades.filter((trade: ParsedTrade) => existingTickets.has(trade.brokerTicketId!)).length;

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

// GET /api/trades
router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const side = req.query.side as string | undefined;
    const status = req.query.status as string | undefined;
    const accountId = req.query.accountId as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const pageNum = parseInt((req.query.page as string) || '1');
    const limitNum = Math.min(parseInt((req.query.limit as string) || '50'), 100);
    const hasRange = typeof from === 'string' && typeof to === 'string';
    const take = hasRange ? 1000 : limitNum;
    const skip = hasRange ? 0 : (pageNum - 1) * limitNum;

    const where: {
      userId: string;
      symbol?: { contains: string; mode: 'insensitive' };
      side?: 'LONG' | 'SHORT';
      status?: 'OPEN' | 'CLOSED';
      accountId?: string;
      exitDate?: { gte: Date; lte: Date };
    } = { userId: req.userId! };

    if (search) where.symbol = { contains: search, mode: 'insensitive' };
    if (side === 'LONG' || side === 'SHORT') where.side = side;
    if (status === 'OPEN' || status === 'CLOSED') where.status = status;
    if (accountId && accountId !== 'ALL') where.accountId = accountId;
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

// POST /api/trades
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = tradeSchema.safeParse(body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const data = result.data;
    let accountId = data.accountId;
    if (!accountId) {
      const defaultAccount = await prisma.account.findFirst({
        where: { userId: req.userId, isDefault: true },
        orderBy: { createdAt: 'asc' },
      });
      if (defaultAccount) {
        accountId = defaultAccount.id;
      } else {
        const newAccount = await prisma.account.create({
          data: { userId: req.userId!, name: 'Default Account', initialBalance: 0 },
        });
        accountId = newAccount.id;
      }
    }

    const grossPnl = body.grossPnl != null ? Number(body.grossPnl) : null;
    const commission = data.commission ?? 0;
    const pnl = data.exitPrice && grossPnl != null ? grossPnl - commission : null;
    const rMultipleRaw = data.exitPrice && data.stopLoss ? calculateRMultiple({
      side: data.side as 'LONG' | 'SHORT',
      entryPrice: data.entryPrice,
      exitPrice: data.exitPrice,
      quantity: data.quantity,
      stopLoss: data.stopLoss,
      commission: data.commission,
    }) : null;
    const rMultiple = rMultipleRaw != null && Math.abs(rMultipleRaw) < 9999 ? rMultipleRaw : null;

    let tradeStatus = data.status;
    if (data.exitPrice && data.exitDate) tradeStatus = 'CLOSED';

    const images = body.images as { url: string; caption?: string | null; type?: string }[] | undefined;

    const trade = await prisma.trade.create({
      data: {
        userId: req.userId!,
        accountId: accountId!,
        symbol: data.symbol,
        side: data.side,
        status: tradeStatus,
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
        tags: { create: data.tagIds.map((tagId) => ({ tagId })) },
        ...(images && images.length > 0 ? {
          images: { create: images.map((img) => ({ url: img.url, caption: img.caption || null, type: img.type || 'image' })) },
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

// GET /api/trades/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const trade = await prisma.trade.findFirst({
      where: { id, userId: req.userId },
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

async function handleTradeUpdate(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = { ...req.body } as Record<string, unknown>;
    const images = body.images as { url: string; caption?: string | null; type?: string }[] | undefined;
    delete body.images;
    delete body.tagIds;

    const currentTrade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
    if (!currentTrade) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }

    let pnl = currentTrade.pnl;
    let rMultiple = currentTrade.rMultiple;
    let status = currentTrade.status;

    const grossPnl = body.grossPnl != null ? Number(body.grossPnl) : null;
    delete body.grossPnl;

    const exitPrice = body.exitPrice !== undefined ? Number(body.exitPrice) : (currentTrade.exitPrice ? Number(currentTrade.exitPrice) : null);
    const commission = body.commission !== undefined ? Number(body.commission) : Number(currentTrade.commission);
    const stopLoss = body.stopLoss !== undefined ? Number(body.stopLoss) : (currentTrade.stopLoss ? Number(currentTrade.stopLoss) : null);

    if (exitPrice) {
      if (grossPnl != null) pnl = new Decimal(grossPnl - commission);
      status = 'CLOSED';
    } else {
      pnl = null;
      status = 'OPEN';
    }

    if (exitPrice && stopLoss) {
      const rRaw = calculateRMultiple({
        side: (body.side || currentTrade.side) as 'LONG' | 'SHORT',
        entryPrice: body.entryPrice !== undefined ? Number(body.entryPrice) : Number(currentTrade.entryPrice),
        exitPrice,
        quantity: body.quantity !== undefined ? Number(body.quantity) : Number(currentTrade.quantity),
        stopLoss,
        commission,
      });
      rMultiple = rRaw != null && Math.abs(rRaw) < 9999 ? new Decimal(rRaw) : null;
    } else {
      rMultiple = null;
    }

    if (body.status === 'OPEN' || body.status === 'CLOSED') status = body.status;
    if (body.entryDate && typeof body.entryDate === 'string') body.entryDate = new Date(body.entryDate);
    if (body.exitDate && typeof body.exitDate === 'string') body.exitDate = new Date(body.exitDate);

    if (images !== undefined) {
      await prisma.tradeImage.deleteMany({ where: { tradeId: id } });
      if (images.length > 0) {
        await prisma.tradeImage.createMany({
          data: images.map((img) => ({
            tradeId: id,
            url: img.url,
            caption: img.caption || null,
            type: img.type || 'image',
          })),
        });
      }
    }

    const updatedTrade = await prisma.trade.update({
      where: { id },
      data: { ...body, status, pnl, pnlPercent: null, rMultiple } as never,
      include: { images: true },
    });

    res.json(formatTrade(updatedTrade));
  } catch (error) {
    console.error('Error updating trade:', error);
    res.status(500).json({ error: 'Failed to update trade' });
  }
}

// PATCH /api/trades/:id
router.patch('/:id', handleTradeUpdate);

// PUT /api/trades/:id
router.put('/:id', handleTradeUpdate);

// DELETE /api/trades/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const trade = await prisma.trade.findFirst({ where: { id, userId: req.userId } });
    if (!trade) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }

    await prisma.trade.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting trade:', error);
    res.status(500).json({ error: 'Failed to delete trade' });
  }
});

export default router;
