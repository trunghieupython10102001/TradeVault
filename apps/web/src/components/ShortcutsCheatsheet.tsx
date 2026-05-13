'use client';

import { useShortcutContext } from '@/lib/shortcuts';
import styles from './ShortcutsCheatsheet.module.css';

const SHORTCUTS = [
  ['⌘K / Ctrl K', 'Open command palette'],
  ['N', 'New trade'],
  ['J', 'Open journal'],
  ['?', 'Show shortcuts'],
  ['Esc', 'Close modal'],
];

export function ShortcutsCheatsheet() {
  const { cheatsheetOpen, setCheatsheetOpen } = useShortcutContext();
  if (!cheatsheetOpen) return null;

  return (
    <div className={styles.backdrop} onClick={() => setCheatsheetOpen(false)} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <div className={styles.header}>
          <h2>Keyboard Shortcuts</h2>
          <button type="button" onClick={() => setCheatsheetOpen(false)}>Esc</button>
        </div>
        <div className={styles.list}>
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys} className={styles.row}>
              <span>{label}</span>
              <kbd>{keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
