import { Router, Response } from 'express';
import { prisma } from '@repo/database';
import { AuthRequest } from '../middleware/auth';
import { journalSchema } from '../lib/validators';

const router = Router();

// GET /journal
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const journalEntries = await prisma.journalEntry.findMany({
      where: { userId },
      orderBy: { entryDate: 'desc' },
    });

    res.json(journalEntries);
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// POST /journal
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const result = journalSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ error: 'Invalid input', details: result.error.issues });
      return;
    }

    const data = result.data;

    const entry = await prisma.journalEntry.upsert({
      where: {
        userId_entryDate: {
          userId,
          entryDate: data.entryDate,
        },
      },
      update: {
        content: data.content,
        mood: data.mood,
        confidenceLevel: data.confidenceLevel,
      },
      create: {
        userId,
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
