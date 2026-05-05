import { z } from 'zod';

export const tradeSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required').toUpperCase(),
  side: z.enum(['LONG', 'SHORT']),
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
  entryPrice: z.coerce.number().positive('Entry price must be positive'),
  exitPrice: z.coerce.number().positive().optional().nullable(),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  stopLoss: z.coerce.number().positive().optional().nullable(),
  takeProfit: z.coerce.number().positive().optional().nullable(),
  commission: z.coerce.number().min(0).default(0),
  strategy: z.string().optional().nullable(),
  timeframe: z.string().optional().nullable(),
  rating: z.coerce.number().int().min(0).max(5).default(0),
  notes: z.string().optional().nullable(),
  setupDescription: z.string().optional().nullable(),
  mistakes: z.string().optional().nullable(),
  lessons: z.string().optional().nullable(),
  entryDate: z.coerce.date(),
  exitDate: z.coerce.date().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  tagIds: z.array(z.string().uuid()).optional().default([]),
});

export const journalSchema = z.object({
  entryDate: z.coerce.date(),
  content: z.string().min(1, 'Content is required'),
  mood: z.enum(['GREAT', 'GOOD', 'NEUTRAL', 'BAD', 'TERRIBLE']).optional().nullable(),
  confidenceLevel: z.coerce.number().int().min(1).max(10).optional().nullable(),
});

export type TradeInput = z.infer<typeof tradeSchema>;
export type JournalInput = z.infer<typeof journalSchema>;
