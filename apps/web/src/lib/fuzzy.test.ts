import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches ordered characters', () => {
    expect(fuzzyMatch('dash', 'Dashboard')).toBe(true);
    expect(fuzzyMatch('eur', 'EURUSD trade')).toBe(true);
  });

  it('does not match out-of-order characters', () => {
    expect(fuzzyMatch('zz', 'Dashboard')).toBe(false);
  });
});
