import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { calculateRMultiple } from '@/server/lib/calculations';
import { formatTrade, getAuthenticatedUserId } from '../helpers';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const trade = await prisma.trade.findFirst({
      where: { id, userId: auth.userId },
      include: { tags: { include: { tag: true } }, images: true },
    });

    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });
    return NextResponse.json(formatTrade(trade));
  } catch (error) {
    console.error('Error fetching trade:', error);
    return NextResponse.json({ error: 'Failed to fetch trade' }, { status: 500 });
  }
}

async function handleTradeUpdate(request: Request, context: RouteContext) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const body = { ...(await request.json()) };
    const images = body.images as { url: string; caption?: string | null; type?: string }[] | undefined;
    delete body.images;
    delete body.tagIds;

    const currentTrade = await prisma.trade.findFirst({ where: { id, userId: auth.userId } });
    if (!currentTrade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    let pnl = currentTrade.pnl;
    let rMultiple = currentTrade.rMultiple;
    let status = currentTrade.status;

    const grossPnl = body.grossPnl != null ? Number(body.grossPnl) : null;
    delete body.grossPnl;

    const exitPrice = body.exitPrice !== undefined ? body.exitPrice : (currentTrade.exitPrice ? Number(currentTrade.exitPrice) : null);
    const commission = body.commission !== undefined ? Number(body.commission) : Number(currentTrade.commission);
    const stopLoss = body.stopLoss !== undefined ? body.stopLoss : (currentTrade.stopLoss ? Number(currentTrade.stopLoss) : null);

    if (exitPrice) {
      if (grossPnl != null) pnl = (grossPnl - commission) as any;
      status = 'CLOSED' as any;
    } else {
      pnl = null;
      status = 'OPEN' as any;
    }

    if (exitPrice && stopLoss) {
      const rRaw = calculateRMultiple({
        side: (body.side || currentTrade.side) as 'LONG' | 'SHORT',
        entryPrice: body.entryPrice !== undefined ? body.entryPrice : Number(currentTrade.entryPrice),
        exitPrice,
        quantity: body.quantity !== undefined ? body.quantity : Number(currentTrade.quantity),
        stopLoss,
        commission,
      });
      rMultiple = rRaw != null && Math.abs(rRaw) < 9999 ? rRaw as any : null;
    } else {
      rMultiple = null;
    }

    if (body.status) status = body.status;
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
      data: { ...body, status, pnl, pnlPercent: null, rMultiple },
      include: { images: true },
    });

    return NextResponse.json(formatTrade(updatedTrade));
  } catch (error) {
    console.error('Error updating trade:', error);
    return NextResponse.json({ error: 'Failed to update trade' }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleTradeUpdate(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return handleTradeUpdate(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const trade = await prisma.trade.findFirst({ where: { id, userId: auth.userId } });
    if (!trade) return NextResponse.json({ error: 'Trade not found' }, { status: 404 });

    await prisma.trade.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting trade:', error);
    return NextResponse.json({ error: 'Failed to delete trade' }, { status: 500 });
  }
}
