import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getAuthenticatedUserId } from '../helpers';

export async function GET(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const rows = await prisma.trade.findMany({
      where: { userId: auth.userId },
      select: { symbol: true },
      distinct: ['symbol'],
      orderBy: { symbol: 'asc' },
    });
    return NextResponse.json(rows.map((r) => r.symbol));
  } catch {
    return NextResponse.json({ error: 'Failed to fetch symbols' }, { status: 500 });
  }
}
