import { NextResponse } from 'next/server';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { getUserIdFromRequest } from '@/server/auth/legacy-jwt';

const updateSettingsSchema = z.object({
  currency: z.string().min(1).max(10).optional(),
  timezone: z.string().min(1).optional(),
  dateFormat: z.string().min(1).optional(),
  riskPerTrade: z.coerce.number().min(0).max(100).optional(),
  maxDailyLoss: z.coerce.number().min(0).optional().nullable(),
  maxPositionSize: z.coerce.number().min(0).optional().nullable(),
  defaultLeverage: z.coerce.number().min(0).optional(),
  startingCapital: z.coerce.number().min(0).optional(),
  weeklyGoal: z.coerce.number().min(0).optional().nullable(),
  monthlyGoal: z.coerce.number().min(0).optional().nullable(),
  defaultCommission: z.coerce.number().min(0).optional(),
  strategies: z.array(z.string()).optional(),
  assetClasses: z.array(z.string()).optional(),
  journalReminder: z.boolean().optional(),
});

type SettingsWithDecimals = Awaited<ReturnType<typeof prisma.userSettings.findUnique>>;

function formatSettings(settings: NonNullable<SettingsWithDecimals>) {
  return {
    ...settings,
    riskPerTrade: Number(settings.riskPerTrade),
    maxDailyLoss: settings.maxDailyLoss ? Number(settings.maxDailyLoss) : null,
    maxPositionSize: settings.maxPositionSize ? Number(settings.maxPositionSize) : null,
    defaultLeverage: Number(settings.defaultLeverage),
    startingCapital: Number(settings.startingCapital),
    weeklyGoal: settings.weeklyGoal ? Number(settings.weeklyGoal) : null,
    monthlyGoal: settings.monthlyGoal ? Number(settings.monthlyGoal) : null,
    defaultCommission: Number(settings.defaultCommission),
  };
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
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: auth.userId },
      update: {},
      create: { userId: auth.userId },
    });

    return NextResponse.json({ profile: user, settings: formatSettings(settings) });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = getAuthenticatedUserId(request);
  if (auth.response) return auth.response;

  try {
    const result = updateSettingsSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ error: 'Invalid input', details: result.error.issues }, { status: 400 });
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: auth.userId },
      update: result.data,
      create: { userId: auth.userId, ...result.data },
    });

    return NextResponse.json(formatSettings(settings));
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
