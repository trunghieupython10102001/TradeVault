import { Router, Response } from 'express';
import { prisma } from '@repo/database';
import { AuthRequest } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

const tagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
});

// GET /tags
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { userId: req.userId! },
      orderBy: { name: 'asc' },
    });
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// POST /tags
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = tagSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }
    const existing = await prisma.tag.findFirst({
      where: { userId: req.userId!, name: { equals: result.data.name, mode: 'insensitive' } },
    });
    if (existing) {
      res.status(409).json({ error: 'Tag with this name already exists' });
      return;
    }
    const tag = await prisma.tag.create({
      data: { userId: req.userId!, name: result.data.name, color: result.data.color },
    });
    res.status(201).json(tag);
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// DELETE /tags/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.tradeTag.deleteMany({ where: { tagId: id } });
    await prisma.tag.delete({ where: { id, userId: req.userId! } });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

export default router;
