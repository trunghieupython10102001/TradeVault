import { Router, Response } from 'express';
import { prisma } from '@repo/database';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required'),
  broker: z.string().optional().nullable(),
  initialBalance: z.coerce.number().min(0).default(0),
  currency: z.string().default('USD'),
  isDefault: z.boolean().default(false),
});

function formatAccount(a: any) {
  return { ...a, initialBalance: Number(a.initialBalance) };
}

// GET /accounts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(accounts.map(formatAccount));
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// POST /accounts
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = accountSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const data = result.data;

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await prisma.account.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.account.create({
      data: { userId, ...data },
    });

    res.status(201).json(formatAccount(account));
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PATCH /accounts/:id
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const existing = await prisma.account.findUnique({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const result = accountSchema.partial().safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    if (result.data.isDefault) {
      await prisma.account.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.account.update({
      where: { id, userId },
      data: result.data,
    });

    res.json(formatAccount(account));
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /accounts/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const count = await prisma.account.count({ where: { userId } });
    if (count <= 1) {
      res.status(400).json({ error: 'Cannot delete your only account' });
      return;
    }

    const account = await prisma.account.findUnique({ where: { id, userId } });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    await prisma.account.delete({ where: { id, userId } });

    // If deleted account was default, make another one default
    if (account.isDefault) {
      const first = await prisma.account.findFirst({ where: { userId } });
      if (first) {
        await prisma.account.update({ where: { id: first.id }, data: { isDefault: true } });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
