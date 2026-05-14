import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { tradeSchema } from '@/server/lib/validators';
import { calculateRMultiple } from '@/server/lib/calculations';
import { formatTrade, getAuthenticatedUserId } from './helpers';

export async function GET(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const side = searchParams.get('side');
    const status = searchParams.get('status');
    const accountId = searchParams.get('accountId');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const pageNum = parseInt(searchParams.get('page') || '1');
    const limitNum = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const hasRange = typeof from === 'string' && typeof to === 'string';
    const take = hasRange ? 1000 : limitNum;
    const skip = hasRange ? 0 : (pageNum - 1) * limitNum;

    const where: any = { userId: auth.userId };

    if (search) where.symbol = { contains: search, mode: 'insensitive' };
    if (side && side !== 'ALL') where.side = side as any;
    if (status && status !== 'ALL') where.status = status as any;
    if (accountId && accountId !== 'ALL') where.accountId = accountId;
    if (hasRange) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        return NextResponse.json({ error: 'Invalid date range. Use ISO dates for from and to.' }, { status: 400 });
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

    return NextResponse.json({
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
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const result = tradeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', details: result.error.issues }, { status: 400 });
    }

    const data = result.data;
    let accountId = data.accountId;
    if (!accountId) {
      const defaultAccount = await prisma.account.findFirst({
        where: { userId: auth.userId, isDefault: true },
        orderBy: { createdAt: 'asc' },
      });
      if (defaultAccount) {
        accountId = defaultAccount.id;
      } else {
        const newAccount = await prisma.account.create({
          data: { userId: auth.userId, name: 'Default Account', initialBalance: 0 },
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

    let tradeStatus = data.status as any;
    if (data.exitPrice && data.exitDate) tradeStatus = 'CLOSED';

    const images = body.images as { url: string; caption?: string | null; type?: string }[] | undefined;

    const trade = await prisma.trade.create({
      data: {
        userId: auth.userId,
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
        tags: { create: data.tagIds.map((tagId) => ({ tagId })) },
        ...(images && images.length > 0 ? {
          images: { create: images.map((img) => ({ url: img.url, caption: img.caption || null, type: img.type || 'image' })) },
        } : {}),
      },
      include: { images: true },
    });

    return NextResponse.json(trade);
  } catch (error) {
    console.error('Error creating trade:', error);
    return NextResponse.json({ error: 'Failed to create trade' }, { status: 500 });
  }
}
