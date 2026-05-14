import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const auth = getUserIdFromRequest(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!auth.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = auth.userId;

  try {
    const { id } = await context.params;
    const tag = await prisma.tag.findFirst({ where: { id, userId } });
    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    await prisma.tradeTag.deleteMany({ where: { tagId: id } });
    await prisma.tag.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tag:', error);
    return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
  }
}
