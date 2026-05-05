import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  tradeSchema,
  accountSchema,
  tagSchema,
  journalSchema,
} from './validators';

// ---------------------------------------------------------------------------
// registerSchema
// ---------------------------------------------------------------------------
describe('registerSchema', () => {
  const valid = { name: 'Harry Nguyen', email: 'harry@example.com', password: 'secret123' };

  it('accepts valid registration data', () => {
    expect(() => registerSchema.parse(valid)).not.toThrow();
  });

  it('rejects name shorter than 2 characters', () => {
    expect(() => registerSchema.parse({ ...valid, name: 'H' })).toThrow();
  });

  it('accepts name with exactly 2 characters', () => {
    expect(() => registerSchema.parse({ ...valid, name: 'HN' })).not.toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => registerSchema.parse({ ...valid, email: 'not-an-email' })).toThrow();
    expect(() => registerSchema.parse({ ...valid, email: 'missing@' })).toThrow();
  });

  it('rejects password shorter than 8 characters', () => {
    expect(() => registerSchema.parse({ ...valid, password: 'short' })).toThrow();
  });

  it('accepts password of exactly 8 characters', () => {
    expect(() => registerSchema.parse({ ...valid, password: 'exactly8' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// loginSchema
// ---------------------------------------------------------------------------
describe('loginSchema', () => {
  const valid = { email: 'harry@example.com', password: 'anypassword' };

  it('accepts valid login data', () => {
    expect(() => loginSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid email', () => {
    expect(() => loginSchema.parse({ ...valid, email: 'bad' })).toThrow();
  });

  it('rejects empty password', () => {
    expect(() => loginSchema.parse({ ...valid, password: '' })).toThrow();
  });

  it('accepts any non-empty password (no min length on login)', () => {
    expect(() => loginSchema.parse({ ...valid, password: 'x' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// tradeSchema
// ---------------------------------------------------------------------------
describe('tradeSchema', () => {
  const valid = {
    symbol: 'aapl',
    side: 'LONG',
    entryPrice: 150,
    quantity: 10,
    entryDate: '2024-01-15',
  };

  it('accepts a minimal valid trade', () => {
    expect(() => tradeSchema.parse(valid)).not.toThrow();
  });

  it('uppercases the symbol', () => {
    expect(tradeSchema.parse(valid).symbol).toBe('AAPL');
  });

  it('defaults status to OPEN', () => {
    expect(tradeSchema.parse(valid).status).toBe('OPEN');
  });

  it('defaults commission to 0', () => {
    expect(tradeSchema.parse(valid).commission).toBe(0);
  });

  it('defaults rating to 0', () => {
    expect(tradeSchema.parse(valid).rating).toBe(0);
  });

  it('defaults tagIds to []', () => {
    expect(tradeSchema.parse(valid).tagIds).toEqual([]);
  });

  it('rejects empty symbol', () => {
    expect(() => tradeSchema.parse({ ...valid, symbol: '' })).toThrow();
  });

  it('rejects invalid side', () => {
    expect(() => tradeSchema.parse({ ...valid, side: 'BUY' })).toThrow();
  });

  it('rejects non-positive entryPrice', () => {
    expect(() => tradeSchema.parse({ ...valid, entryPrice: 0 })).toThrow();
    expect(() => tradeSchema.parse({ ...valid, entryPrice: -1 })).toThrow();
  });

  it('rejects non-positive quantity', () => {
    expect(() => tradeSchema.parse({ ...valid, quantity: 0 })).toThrow();
  });

  it('rejects rating above 5', () => {
    expect(() => tradeSchema.parse({ ...valid, rating: 6 })).toThrow();
  });

  it('rejects non-integer rating', () => {
    expect(() => tradeSchema.parse({ ...valid, rating: 3.5 })).toThrow();
  });

  it('accepts all ratings 0–5', () => {
    [0, 1, 2, 3, 4, 5].forEach((r) => {
      expect(() => tradeSchema.parse({ ...valid, rating: r })).not.toThrow();
    });
  });

  it('coerces string prices and dates', () => {
    const result = tradeSchema.parse({ ...valid, entryPrice: '150.5', quantity: '3' });
    expect(result.entryPrice).toBe(150.5);
    expect(result.entryDate).toBeInstanceOf(Date);
  });

  it('rejects invalid accountId (non-UUID)', () => {
    expect(() => tradeSchema.parse({ ...valid, accountId: 'not-a-uuid' })).toThrow();
  });

  it('accepts valid UUID accountId', () => {
    expect(() =>
      tradeSchema.parse({ ...valid, accountId: '550e8400-e29b-41d4-a716-446655440000' })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// accountSchema
// ---------------------------------------------------------------------------
describe('accountSchema', () => {
  const valid = { name: 'Main Account' };

  it('accepts minimal account', () => {
    expect(() => accountSchema.parse(valid)).not.toThrow();
  });

  it('defaults initialBalance to 0', () => {
    expect(accountSchema.parse(valid).initialBalance).toBe(0);
  });

  it('defaults currency to USD', () => {
    expect(accountSchema.parse(valid).currency).toBe('USD');
  });

  it('defaults isDefault to false', () => {
    expect(accountSchema.parse(valid).isDefault).toBe(false);
  });

  it('rejects empty account name', () => {
    expect(() => accountSchema.parse({ name: '' })).toThrow();
  });

  it('rejects negative initialBalance', () => {
    expect(() => accountSchema.parse({ ...valid, initialBalance: -1 })).toThrow();
  });

  it('accepts zero initialBalance', () => {
    expect(() => accountSchema.parse({ ...valid, initialBalance: 0 })).not.toThrow();
  });

  it('accepts optional broker as null', () => {
    expect(() => accountSchema.parse({ ...valid, broker: null })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// tagSchema
// ---------------------------------------------------------------------------
describe('tagSchema', () => {
  it('accepts a valid tag', () => {
    expect(() => tagSchema.parse({ name: 'Breakout', color: '#ff5733' })).not.toThrow();
  });

  it('defaults color to #6366f1', () => {
    expect(tagSchema.parse({ name: 'Test' }).color).toBe('#6366f1');
  });

  it('rejects empty tag name', () => {
    expect(() => tagSchema.parse({ name: '' })).toThrow();
  });

  it('rejects invalid hex color — missing #', () => {
    expect(() => tagSchema.parse({ name: 'Tag', color: 'ff5733' })).toThrow();
  });

  it('rejects invalid hex color — wrong length', () => {
    expect(() => tagSchema.parse({ name: 'Tag', color: '#fff' })).toThrow();
  });

  it('accepts uppercase and lowercase hex', () => {
    expect(() => tagSchema.parse({ name: 'Tag', color: '#FF5733' })).not.toThrow();
    expect(() => tagSchema.parse({ name: 'Tag', color: '#ff5733' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// journalSchema
// ---------------------------------------------------------------------------
describe('journalSchema', () => {
  const valid = { entryDate: '2024-01-15', content: 'Good session today.' };

  it('accepts a valid journal entry', () => {
    expect(() => journalSchema.parse(valid)).not.toThrow();
  });

  it('rejects empty content', () => {
    expect(() => journalSchema.parse({ ...valid, content: '' })).toThrow();
  });

  it('coerces entryDate to Date', () => {
    expect(journalSchema.parse(valid).entryDate).toBeInstanceOf(Date);
  });

  it('accepts all valid moods', () => {
    ['GREAT', 'GOOD', 'NEUTRAL', 'BAD', 'TERRIBLE'].forEach((mood) => {
      expect(() => journalSchema.parse({ ...valid, mood })).not.toThrow();
    });
  });

  it('rejects invalid mood', () => {
    expect(() => journalSchema.parse({ ...valid, mood: 'OKAY' })).toThrow();
  });

  it('accepts confidenceLevel 1–10', () => {
    [1, 5, 10].forEach((level) => {
      expect(() => journalSchema.parse({ ...valid, confidenceLevel: level })).not.toThrow();
    });
  });

  it('rejects confidenceLevel out of range', () => {
    expect(() => journalSchema.parse({ ...valid, confidenceLevel: 0 })).toThrow();
    expect(() => journalSchema.parse({ ...valid, confidenceLevel: 11 })).toThrow();
  });

  it('accepts null mood and confidenceLevel', () => {
    expect(() =>
      journalSchema.parse({ ...valid, mood: null, confidenceLevel: null })
    ).not.toThrow();
  });
});
