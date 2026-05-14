import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';

const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  broker: z.string().optional().nullable(),
  initialBalance: z.coerce.number().min(0).default(0),
  currency: z.string().default('USD'),
  isDefault: z.boolean().default(false),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AccountWithDecimal = Awaited<ReturnType<typeof prisma.account.findFirst>>;

function formatAccount(account: NonNullable<AccountWithDecimal>) {
  return { ...account, initialBalance: Number(account.initialBalance) };
}

function getAuthenticatedUserId(request: Request) {
  const auth = getUserIdFromRequest(request);
  if (auth.error) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  if (!auth.userId) {
    return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }
  return { userId: auth.userId };
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const existing = await prisma.account.findFirst({ where: { id, userId: auth.userId } });
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const result = accountSchema.partial().safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', details: result.error.issues }, { status: 400 });
    }

    if (result.data.isDefault) {
      await prisma.account.updateMany({
        where: { userId: auth.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.account.update({
      where: { id },
      data: result.data,
    });

    return NextResponse.json(formatAccount(account));
  } catch (error) {
    console.error('Error updating account:', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;

    const count = await prisma.account.count({ where: { userId: auth.userId } });
    if (count <= 1) {
      return NextResponse.json({ error: 'Cannot delete your only account' }, { status: 400 });
    }

    const account = await prisma.account.findFirst({ where: { id, userId: auth.userId } });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    await prisma.account.delete({ where: { id } });

    if (account.isDefault) {
      const first = await prisma.account.findFirst({ where: { userId: auth.userId } });
      if (first) {
        await prisma.account.update({ where: { id: first.id }, data: { isDefault: true } });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
