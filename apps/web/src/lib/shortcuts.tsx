'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ShortcutContextValue {
  paletteOpen: boolean;
  cheatsheetOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setCheatsheetOpen: (open: boolean) => void;
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null);

export function shouldHandleEvent(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  const isEditable = target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
  return !isEditable || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k');
}

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!shouldHandleEvent(event)) return;
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (event.key === '?') {
        event.preventDefault();
        setCheatsheetOpen(true);
      } else if (event.key === 'Escape') {
        setPaletteOpen(false);
        setCheatsheetOpen(false);
      } else if (key === 'n') {
        event.preventDefault();
        router.push('/dashboard/trades/new');
      } else if (key === 'j') {
        event.preventDefault();
        router.push('/dashboard/journal');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return (
    <ShortcutContext.Provider value={{ paletteOpen, cheatsheetOpen, setPaletteOpen, setCheatsheetOpen }}>
      {children}
    </ShortcutContext.Provider>
  );
}

export function useShortcutContext() {
  const context = useContext(ShortcutContext);
  if (!context) throw new Error('useShortcutContext must be used inside ShortcutProvider');
  return context;
}
