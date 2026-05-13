export type Mood = 'GREAT' | 'GOOD' | 'NEUTRAL' | 'BAD' | 'TERRIBLE';

export const MOODS: Record<Mood, { label: string; color: string; background: string }> = {
  GREAT: { label: 'Great', color: 'var(--mood-great)', background: 'var(--mood-great-bg)' },
  GOOD: { label: 'Good', color: 'var(--mood-good)', background: 'var(--mood-good-bg)' },
  NEUTRAL: { label: 'Neutral', color: 'var(--mood-neutral)', background: 'var(--mood-neutral-bg)' },
  BAD: { label: 'Bad', color: 'var(--mood-bad)', background: 'var(--mood-bad-bg)' },
  TERRIBLE: { label: 'Terrible', color: 'var(--mood-terrible)', background: 'var(--mood-terrible-bg)' },
};
