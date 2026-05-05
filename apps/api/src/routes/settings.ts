import { Router, Response } from 'express';
import { prisma } from '@repo/database';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

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

function formatSettings(s: any) {
  return {
    ...s,
    riskPerTrade: Number(s.riskPerTrade),
    maxDailyLoss: s.maxDailyLoss ? Number(s.maxDailyLoss) : null,
    maxPositionSize: s.maxPositionSize ? Number(s.maxPositionSize) : null,
    defaultLeverage: Number(s.defaultLeverage),
    startingCapital: Number(s.startingCapital),
    weeklyGoal: s.weeklyGoal ? Number(s.weeklyGoal) : null,
    monthlyGoal: s.monthlyGoal ? Number(s.monthlyGoal) : null,
    defaultCommission: Number(s.defaultCommission),
  };
}

// GET /settings
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    let settings = await prisma.userSettings.findUnique({ where: { userId } });

    if (!settings) {
      settings = await prisma.userSettings.create({ data: { userId } });
    }

    res.json({ profile: user, settings: formatSettings(settings) });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PATCH /settings
router.patch('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = updateSettingsSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: result.data,
      create: { userId, ...result.data },
    });

    res.json(formatSettings(settings));
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// PATCH /settings/profile
router.patch('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = updateProfileSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    if (result.data.email) {
      const existing = await prisma.user.findUnique({ where: { email: result.data.email } });
      if (existing && existing.id !== userId) {
        res.status(409).json({ error: 'Email already in use' });
        return;
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
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
