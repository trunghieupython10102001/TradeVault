import { describe, it, expect } from 'vitest';
import {
  periodStart,
  periodEnd,
  periodLabel,
  navigatePeriod,
  toISODate,
} from './journalPeriod';

describe('periodStart', () => {
  it('DAY returns the same date at midnight', () => {
    const d = new Date('2025-01-15T14:30:00');
    expect(toISODate(periodStart(d, 'DAY'))).toBe('2025-01-15');
  });

  it('WEEK returns the Monday of the week', () => {
    const d = new Date('2025-01-15');
    expect(toISODate(periodStart(d, 'WEEK'))).toBe('2025-01-13');
  });

  it('WEEK returns Monday when input is Sunday', () => {
    const d = new Date('2025-01-19');
    expect(toISODate(periodStart(d, 'WEEK'))).toBe('2025-01-13');
  });

  it('WEEK returns itself when input is Monday', () => {
    const d = new Date('2025-01-13');
    expect(toISODate(periodStart(d, 'WEEK'))).toBe('2025-01-13');
  });

  it('MONTH returns the 1st of the month', () => {
    const d = new Date('2025-01-15');
    expect(toISODate(periodStart(d, 'MONTH'))).toBe('2025-01-01');
  });
});

describe('periodEnd', () => {
  it('DAY end equals start', () => {
    const start = new Date('2025-01-15');
    expect(toISODate(periodEnd(start, 'DAY'))).toBe('2025-01-15');
  });

  it('WEEK end is 6 days after start', () => {
    const start = new Date('2025-01-13');
    expect(toISODate(periodEnd(start, 'WEEK'))).toBe('2025-01-19');
  });

  it('MONTH end is the last day of the month', () => {
    const start = new Date('2025-02-01');
    expect(toISODate(periodEnd(start, 'MONTH'))).toBe('2025-02-28');
  });

  it('MONTH end handles leap year', () => {
    const start = new Date('2024-02-01');
    expect(toISODate(periodEnd(start, 'MONTH'))).toBe('2024-02-29');
  });
});

describe('navigatePeriod', () => {
  it('DAY advances by one day', () => {
    const start = new Date('2025-01-15');
    expect(toISODate(navigatePeriod(start, 'DAY', 1))).toBe('2025-01-16');
    expect(toISODate(navigatePeriod(start, 'DAY', -1))).toBe('2025-01-14');
  });

  it('WEEK advances by one week', () => {
    const start = new Date('2025-01-13');
    expect(toISODate(navigatePeriod(start, 'WEEK', 1))).toBe('2025-01-20');
    expect(toISODate(navigatePeriod(start, 'WEEK', -1))).toBe('2025-01-06');
  });

  it('MONTH advances by one month', () => {
    const start = new Date('2025-01-01');
    expect(toISODate(navigatePeriod(start, 'MONTH', 1))).toBe('2025-02-01');
    expect(toISODate(navigatePeriod(start, 'MONTH', -1))).toBe('2024-12-01');
  });
});
