import { Router, Request, Response } from 'express';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

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

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
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

// GET /api/settings
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: req.userId! },
      update: {},
      create: { userId: req.userId! },
    });

    res.json({ profile: user, settings: formatSettings(settings) });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PATCH /api/settings
router.patch('/', async (req: Request, res: Response) => {
  try {
    const result = updateSettingsSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId: req.userId! },
      update: result.data,
      create: { userId: req.userId!, ...result.data },
    });

    res.json(formatSettings(settings));
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// PATCH /api/settings/profile
router.patch('/profile', async (req: Request, res: Response) => {
  try {
    const result = updateProfileSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    if (result.data.email) {
      const existing = await prisma.user.findUnique({ where: { email: result.data.email } });
      if (existing && existing.id !== req.userId) {
        res.status(409).json({ error: 'Email already in use' });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: result.data,
      select: { id: true, name: true, email: true, createdAt: true },
    });

    res.json(user);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;
