export type PeriodType = 'DAY' | 'WEEK' | 'MONTH';

export function periodStart(date: Date, type: PeriodType): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (type === 'DAY') return d;
  if (type === 'WEEK') {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  d.setDate(1);
  return d;
}

export function periodEnd(start: Date, type: PeriodType): Date {
  const d = new Date(start);
  if (type === 'DAY') return d;
  if (type === 'WEEK') { d.setDate(d.getDate() + 6); return d; }
  d.setMonth(d.getMonth() + 1, 0);
  return d;
}

export function periodLabel(start: Date, type: PeriodType): string {
  if (type === 'DAY') {
    return start.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  }
  if (type === 'WEEK') {
    const end = periodEnd(start, 'WEEK');
    const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Week of ${s} – ${e}`;
  }
  return start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function navigatePeriod(start: Date, type: PeriodType, direction: -1 | 1): Date {
  const d = new Date(start);
  if (type === 'DAY') d.setDate(d.getDate() + direction);
  else if (type === 'WEEK') d.setDate(d.getDate() + direction * 7);
  else d.setMonth(d.getMonth() + direction);
  return periodStart(d, type);
}

export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseContent(raw: string): object {
  try { return JSON.parse(raw); }
  catch {
    return {
      type: 'doc',
      content: raw ? [{ type: 'paragraph', content: [{ type: 'text', text: raw }] }] : [],
    };
  }
}
