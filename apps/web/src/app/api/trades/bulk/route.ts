import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getAuthenticatedUserId } from '../helpers';

export async function DELETE(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const { ids } = await request.json() as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const { count } = await prisma.trade.deleteMany({ where: { id: { in: ids }, userId: auth.userId } });
    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    console.error('Error bulk deleting trades:', error);
    return NextResponse.json({ error: 'Failed to delete trades' }, { status: 500 });
  }
}
