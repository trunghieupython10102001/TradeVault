import { Router, Request, Response } from 'express';
import { prisma } from '@repo/database';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

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

// GET /api/accounts
router.get('/', async (req: Request, res: Response) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(accounts.map(formatAccount));
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// POST /api/accounts
router.post('/', async (req: Request, res: Response) => {
  try {
    const result = accountSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const data = result.data;

    if (data.isDefault) {
      await prisma.account.updateMany({
        where: { userId: req.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.account.create({
      data: { userId: req.userId!, ...data },
    });

    res.status(201).json(formatAccount(account));
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// PATCH /api/accounts/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.account.findFirst({ where: { id, userId: req.userId } });
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
        where: { userId: req.userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.account.update({
      where: { id },
      data: result.data,
    });

    res.json(formatAccount(account));
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const count = await prisma.account.count({ where: { userId: req.userId } });
    if (count <= 1) {
      res.status(400).json({ error: 'Cannot delete your only account' });
      return;
    }

    const account = await prisma.account.findFirst({ where: { id, userId: req.userId } });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    await prisma.account.delete({ where: { id } });

    if (account.isDefault) {
      const first = await prisma.account.findFirst({ where: { userId: req.userId } });
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
