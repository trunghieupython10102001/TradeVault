import { Router, Request, Response } from 'express';
import { prisma } from '@repo/database';
import { requireAuth } from '../middleware/auth';
import { journalSchema } from '../lib/validators';

const router = Router();
router.use(requireAuth);

// GET /api/journal
router.get('/', async (req: Request, res: Response) => {
  try {
    const journalEntries = await prisma.journalEntry.findMany({
      where: { userId: req.userId },
      orderBy: { entryDate: 'desc' },
    });
    res.json(journalEntries);
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// POST /api/journal
router.post('/', async (req: Request, res: Response) => {
  try {
    const result = journalSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const data = result.data;
    const entry = await prisma.journalEntry.upsert({
      where: {
        userId_entryDate: {
          userId: req.userId!,
          entryDate: data.entryDate,
        },
      },
      update: {
        content: data.content,
        mood: data.mood,
        confidenceLevel: data.confidenceLevel,
      },
      create: {
        userId: req.userId!,
        entryDate: data.entryDate,
        content: data.content,
        mood: data.mood,
        confidenceLevel: data.confidenceLevel,
      },
    });

    res.json(entry);
  } catch (error) {
    console.error('Error saving journal entry:', error);
    res.status(500).json({ error: 'Failed to save journal entry' });
  }
});

export default router;
