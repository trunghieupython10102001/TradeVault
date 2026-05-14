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

export async function GET(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const accounts = await prisma.account.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(accounts.map(formatAccount));
  } catch (error) {
    console.error('Error fetching accounts:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const result = accountSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', details: result.error.issues }, { status: 400 });
    }

    const data = result.data;

    if (data.isDefault) {
      await prisma.account.updateMany({
        where: { userId: auth.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.account.create({
      data: { userId: auth.userId, ...data },
    });

    return NextResponse.json(formatAccount(account), { status: 201 });
  } catch (error) {
    console.error('Error creating account:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
