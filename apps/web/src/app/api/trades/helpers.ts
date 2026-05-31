import { NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';

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

export function getAuthenticatedUserId(request: Request) {
  const auth = getUserIdFromRequest(request);
  if (auth.error) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  if (!auth.userId) {
    return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  return { userId: auth.userId };
}

export function formatTrade<T extends TradeWithNumericFields>(t: T) {
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

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
