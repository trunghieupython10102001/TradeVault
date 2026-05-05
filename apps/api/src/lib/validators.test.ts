import { describe, it, expect } from 'vitest';
import { tradeSchema, journalSchema } from './validators';

// ---------------------------------------------------------------------------
// tradeSchema
// ---------------------------------------------------------------------------
describe('tradeSchema', () => {
  const validTrade = {
    symbol: 'aapl',
    side: 'LONG',
    entryPrice: 150,
    quantity: 10,
    entryDate: '2024-01-15',
  };

  it('accepts a minimal valid trade', () => {
    expect(() => tradeSchema.parse(validTrade)).not.toThrow();
  });

  it('uppercases the symbol', () => {
    const result = tradeSchema.parse(validTrade);
    expect(result.symbol).toBe('AAPL');
  });

  it('defaults status to OPEN', () => {
    expect(tradeSchema.parse(validTrade).status).toBe('OPEN');
  });

  it('defaults commission to 0', () => {
    expect(tradeSchema.parse(validTrade).commission).toBe(0);
  });

  it('defaults rating to 0', () => {
    expect(tradeSchema.parse(validTrade).rating).toBe(0);
  });

  it('defaults tagIds to []', () => {
    expect(tradeSchema.parse(validTrade).tagIds).toEqual([]);
  });

  it('accepts LONG and SHORT sides', () => {
    expect(() => tradeSchema.parse({ ...validTrade, side: 'LONG' })).not.toThrow();
    expect(() => tradeSchema.parse({ ...validTrade, side: 'SHORT' })).not.toThrow();
  });

  it('rejects invalid side', () => {
    expect(() => tradeSchema.parse({ ...validTrade, side: 'BUY' })).toThrow();
  });

  it('accepts OPEN and CLOSED statuses', () => {
    expect(() => tradeSchema.parse({ ...validTrade, status: 'OPEN' })).not.toThrow();
    expect(() => tradeSchema.parse({ ...validTrade, status: 'CLOSED' })).not.toThrow();
  });

  it('rejects missing symbol', () => {
    const { symbol: _, ...noSymbol } = validTrade;
    expect(() => tradeSchema.parse(noSymbol)).toThrow();
  });

  it('rejects empty symbol', () => {
    expect(() => tradeSchema.parse({ ...validTrade, symbol: '' })).toThrow();
  });

  it('rejects non-positive entryPrice', () => {
    expect(() => tradeSchema.parse({ ...validTrade, entryPrice: 0 })).toThrow();
    expect(() => tradeSchema.parse({ ...validTrade, entryPrice: -10 })).toThrow();
  });

  it('rejects non-positive quantity', () => {
    expect(() => tradeSchema.parse({ ...validTrade, quantity: 0 })).toThrow();
    expect(() => tradeSchema.parse({ ...validTrade, quantity: -1 })).toThrow();
  });

  it('coerces string prices to numbers', () => {
    const result = tradeSchema.parse({ ...validTrade, entryPrice: '150.5', quantity: '5' });
    expect(result.entryPrice).toBe(150.5);
    expect(result.quantity).toBe(5);
  });

  it('rejects negative commission', () => {
    expect(() => tradeSchema.parse({ ...validTrade, commission: -1 })).toThrow();
  });

  it('accepts commission of 0', () => {
    expect(() => tradeSchema.parse({ ...validTrade, commission: 0 })).not.toThrow();
  });

  it('rejects rating above 5', () => {
    expect(() => tradeSchema.parse({ ...validTrade, rating: 6 })).toThrow();
  });

  it('rejects non-integer rating', () => {
    expect(() => tradeSchema.parse({ ...validTrade, rating: 2.5 })).toThrow();
  });

  it('accepts rating 0–5', () => {
    [0, 1, 2, 3, 4, 5].forEach((r) => {
      expect(() => tradeSchema.parse({ ...validTrade, rating: r })).not.toThrow();
    });
  });

  it('coerces entryDate string to Date', () => {
    const result = tradeSchema.parse(validTrade);
    expect(result.entryDate).toBeInstanceOf(Date);
  });

  it('accepts optional nullable fields as null', () => {
    expect(() =>
      tradeSchema.parse({
        ...validTrade,
        exitPrice: null,
        stopLoss: null,
        takeProfit: null,
        exitDate: null,
        accountId: null,
      })
    ).not.toThrow();
  });

  it('validates accountId as UUID when provided', () => {
    expect(() =>
      tradeSchema.parse({ ...validTrade, accountId: 'not-a-uuid' })
    ).toThrow();
    expect(() =>
      tradeSchema.parse({ ...validTrade, accountId: '550e8400-e29b-41d4-a716-446655440000' })
    ).not.toThrow();
  });

  it('validates tagIds as UUID array', () => {
    expect(() =>
      tradeSchema.parse({ ...validTrade, tagIds: ['not-a-uuid'] })
    ).toThrow();
    expect(() =>
      tradeSchema.parse({ ...validTrade, tagIds: ['550e8400-e29b-41d4-a716-446655440000'] })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// journalSchema
// ---------------------------------------------------------------------------
describe('journalSchema', () => {
  const validEntry = {
    entryDate: '2024-01-15',
    content: 'Reviewed my trades today.',
  };

  it('accepts a valid journal entry', () => {
    expect(() => journalSchema.parse(validEntry)).not.toThrow();
  });

  it('rejects empty content', () => {
    expect(() => journalSchema.parse({ ...validEntry, content: '' })).toThrow();
  });

  it('rejects missing entryDate', () => {
    expect(() => journalSchema.parse({ content: 'hello' })).toThrow();
  });

  it('coerces entryDate string to Date', () => {
    const result = journalSchema.parse(validEntry);
    expect(result.entryDate).toBeInstanceOf(Date);
  });

  it('accepts all valid moods', () => {
    const moods = ['GREAT', 'GOOD', 'NEUTRAL', 'BAD', 'TERRIBLE'] as const;
    moods.forEach((mood) => {
      expect(() => journalSchema.parse({ ...validEntry, mood })).not.toThrow();
    });
  });

  it('rejects invalid mood', () => {
    expect(() => journalSchema.parse({ ...validEntry, mood: 'HAPPY' })).toThrow();
  });

  it('accepts confidenceLevel 1–10', () => {
    [1, 5, 10].forEach((level) => {
      expect(() =>
        journalSchema.parse({ ...validEntry, confidenceLevel: level })
      ).not.toThrow();
    });
  });

  it('rejects confidenceLevel 0 and 11', () => {
    expect(() => journalSchema.parse({ ...validEntry, confidenceLevel: 0 })).toThrow();
    expect(() => journalSchema.parse({ ...validEntry, confidenceLevel: 11 })).toThrow();
  });

  it('rejects non-integer confidenceLevel', () => {
    expect(() => journalSchema.parse({ ...validEntry, confidenceLevel: 5.5 })).toThrow();
  });

  it('accepts null mood and confidenceLevel', () => {
    expect(() =>
      journalSchema.parse({ ...validEntry, mood: null, confidenceLevel: null })
    ).not.toThrow();
  });
});
