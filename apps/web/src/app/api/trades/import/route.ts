import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { Prisma, prisma } from '@repo/database';
import { parseCsv } from '@/server/lib/csvParser';
import { calculateRMultiple } from '@/server/lib/calculations';
import { detectAdapter, getAdapter, type NormalizedTrade } from '@/server/lib/brokerAdapters';
import { chunk, getAuthenticatedUserId } from '../helpers';

const IMPORT_BATCH_SIZE = 500;

export async function POST(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const { csv, startingBalance, broker } = await request.json() as {
      csv: string;
      startingBalance?: number;
      broker?: string;
    };

    if (!csv || typeof csv !== 'string') {
      return NextResponse.json({ error: 'CSV content is required' }, { status: 400 });
    }

    const { headers, rows } = parseCsv(csv);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 });
    }

    const adapter = broker ? getAdapter(broker) : detectAdapter(headers);
    if (broker && !adapter) {
      return NextResponse.json({ error: `Unknown broker: ${broker}. Supported: mt4mt5, exness.` }, { status: 400 });
    }
    if (!adapter) {
      return NextResponse.json({ error: 'Could not detect broker format. Supported: MT4/MT5, Exness. Pick a broker manually.' }, { status: 400 });
    }

    let account = await prisma.account.findFirst({
      where: { userId: auth.userId, isDefault: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) {
      account = await prisma.account.create({
        data: { userId: auth.userId, name: 'Default Account', initialBalance: 0, isDefault: true },
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
            entryDate: t.entryDate,
            exitDate: t.exitDate,
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
          where: { userId: auth.userId, brokerTicketId: { in: uniqueTicketTrades.map((trade) => trade.brokerTicketId!) } },
          select: { brokerTicketId: true },
        })
      : [];
    const existingTickets = new Set(existingTicketRows.map((trade) => trade.brokerTicketId).filter(Boolean) as string[]);

    for (const batch of chunk(uniqueTicketTrades, IMPORT_BATCH_SIZE)) {
      const values = batch.map((trade) => {
        const d = trade.data;
        return Prisma.sql`(
          ${randomUUID()}, ${auth.userId}, ${d.accountId}, ${trade.brokerTicketId}, ${d.symbol}, ${d.side}::"TradeSide", ${d.status}::"TradeStatus",
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
      await prisma.trade.createMany({ data: noTicketTrades.map((trade) => ({ userId: auth.userId, ...trade.data })) });
    }

    const createdCount = uniqueTicketTrades.filter((trade) => !existingTickets.has(trade.brokerTicketId!)).length + noTicketTrades.length;
    const updatedCount = uniqueTicketTrades.filter((trade) => existingTickets.has(trade.brokerTicketId!)).length;

    return NextResponse.json({
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
    return NextResponse.json({ error: 'Failed to import trades' }, { status: 500 });
  }
}
