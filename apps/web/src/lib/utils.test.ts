import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cn, formatDate, formatDateTime, generateId, truncate, getInitials, debounce } from './utils';

// ---------------------------------------------------------------------------
// cn (class name utility)
// ---------------------------------------------------------------------------
describe('cn', () => {
  it('joins multiple class strings', () => {
    expect(cn('foo', 'bar', 'baz')).toBe('foo bar baz');
  });

  it('filters out falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });

  it('returns empty string when all values are falsy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('returns single class unchanged', () => {
    expect(cn('only')).toBe('only');
  });

  it('handles empty string argument', () => {
    expect(cn('foo', '', 'bar')).toBe('foo bar');
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats a Date object with default format', () => {
    const d = new Date(2024, 0, 15); // Jan 15 2024
    expect(formatDate(d)).toBe('Jan 15, 2024');
  });

  it('formats an ISO string with default format', () => {
    expect(formatDate('2024-06-20')).toBe('Jun 20, 2024');
  });

  it('accepts a custom format string', () => {
    expect(formatDate('2024-01-15', 'yyyy/MM/dd')).toBe('2024/01/15');
  });

  it('returns empty string for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('');
  });

  it('formats month boundaries correctly', () => {
    expect(formatDate('2024-12-31')).toBe('Dec 31, 2024');
    expect(formatDate('2024-01-01')).toBe('Jan 01, 2024');
  });
});

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------
describe('formatDateTime', () => {
  it('includes date and time', () => {
    const result = formatDateTime('2024-01-15T09:30:00');
    expect(result).toMatch(/Jan 15, 2024/);
    expect(result).toMatch(/09:30/);
  });

  it('returns empty string for invalid input', () => {
    expect(formatDateTime('invalid')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------
describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('returns a valid UUID format', () => {
    const uuid = generateId();
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, generateId));
    expect(ids.size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe('truncate', () => {
  it('returns string unchanged when within length', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns string unchanged when exactly at length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when over length', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('handles length of 0', () => {
    expect(truncate('hello', 0)).toBe('...');
  });
});

// ---------------------------------------------------------------------------
// getInitials
// ---------------------------------------------------------------------------
describe('getInitials', () => {
  it('returns two initials for a full name', () => {
    expect(getInitials('Harry Nguyen')).toBe('HN');
  });

  it('returns one initial for a single name', () => {
    expect(getInitials('Harry')).toBe('H');
  });

  it('uppercases initials', () => {
    expect(getInitials('john doe')).toBe('JD');
  });

  it('uses only first two initials for multi-word names', () => {
    expect(getInitials('John Michael Doe')).toBe('JM');
  });

  it('handles empty string gracefully', () => {
    expect(getInitials('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// debounce
// ---------------------------------------------------------------------------
describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call fn immediately', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    expect(fn).not.toHaveBeenCalled();
  });

  it('calls fn after the delay', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets timer on each call — only fires once for rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments to the underlying function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a', 'b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('a', 'b');
  });

  it('fires again after a second quiet period', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
