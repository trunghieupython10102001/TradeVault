'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/lib/theme';
import styles from './ThemeToggle.module.css';

const OPTIONS: Array<{ value: ThemePreference; label: string; Icon: typeof Monitor }> = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();

  return (
    <div className={`${styles.toggle} ${compact ? styles.compact : ''}`} role="group" aria-label="Theme preference">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className={`${styles.option} ${preference === value ? styles.active : ''}`}
          onClick={() => setPreference(value)}
          aria-pressed={preference === value}
          title={label}
        >
          <Icon size={14} />
          {!compact && <span>{label}</span>}
        </button>
      ))}
    </div>
  );
}
