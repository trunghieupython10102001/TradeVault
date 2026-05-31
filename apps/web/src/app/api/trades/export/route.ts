import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { formatTrade, getAuthenticatedUserId } from '../helpers';

export async function GET(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'html';
    const trades = await prisma.trade.findMany({
      where: { userId: auth.userId },
      orderBy: { entryDate: 'desc' },
      include: { images: true },
    });

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
      const rows = trades.map((t) => [
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
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="trades-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ data: trades.map(formatTrade) });
  } catch (error) {
    console.error('Error exporting trades:', error);
    return NextResponse.json({ error: 'Failed to export trades' }, { status: 500 });
  }
}
