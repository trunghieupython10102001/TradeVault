'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, BookOpen, CalendarDays, Keyboard, LayoutDashboard, ListChecks, Pencil, Plus, Settings, SunMoon } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { fuzzyMatch } from '@/lib/fuzzy';
import { useShortcutContext } from '@/lib/shortcuts';
import { useTheme } from '@/lib/theme';
import styles from './CommandPalette.module.css';

interface PaletteItem {
  id: string;
  group: 'Navigation' | 'Actions' | 'Trades';
  label: string;
  hint?: string;
  Icon?: React.ComponentType<{ size?: number }>;
  run: () => void;
}

interface TradeRow { id: string; symbol: string; entryDate: string; pnl: number | null }

export function CommandPalette() {
  const router = useRouter();
  const { paletteOpen, setPaletteOpen, setCheatsheetOpen } = useShortcutContext();
  const { preference, setPreference } = useTheme();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [tradesLoaded, setTradesLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => setPaletteOpen(false), [setPaletteOpen]);

  useEffect(() => {
    if (!paletteOpen) return;
    setQuery('');
    setSelected(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [paletteOpen]);

  useEffect(() => {
    if (!paletteOpen || tradesLoaded) return;
    let cancelled = false;
    (async () => {
      const res = await apiFetch('/api/trades?limit=200&page=1');
      if (!res.ok) return;
      const json = await res.json();
      const list = (json.data ?? json).map((trade: TradeRow) => ({
        id: trade.id,
        symbol: trade.symbol,
        entryDate: trade.entryDate,
        pnl: trade.pnl,
      }));
      if (!cancelled) {
        setTrades(list);
        setTradesLoaded(true);
      }
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, [paletteOpen, tradesLoaded]);

  const items: PaletteItem[] = useMemo(() => {
    const cycleTheme = () => setPreference(preference === 'system' ? 'light' : preference === 'light' ? 'dark' : 'system');
    const staticItems: PaletteItem[] = [
      { id: 'nav-dashboard', group: 'Navigation', label: 'Dashboard', Icon: LayoutDashboard, run: () => { router.push('/dashboard'); close(); } },
      { id: 'nav-trades', group: 'Navigation', label: 'Trades', Icon: ListChecks, run: () => { router.push('/dashboard/trades'); close(); } },
      { id: 'nav-analytics', group: 'Navigation', label: 'Analytics', Icon: BarChart3, run: () => { router.push('/dashboard/analytics'); close(); } },
      { id: 'nav-journal', group: 'Navigation', label: 'Journal', Icon: BookOpen, run: () => { router.push('/dashboard/journal'); close(); } },
      { id: 'nav-calendar', group: 'Navigation', label: 'Calendar', Icon: CalendarDays, run: () => { router.push('/dashboard/calendar'); close(); } },
      { id: 'nav-settings', group: 'Navigation', label: 'Settings', Icon: Settings, run: () => { router.push('/dashboard/settings'); close(); } },
      { id: 'act-new-trade', group: 'Actions', label: 'New trade', hint: 'N', Icon: Plus, run: () => { router.push('/dashboard/trades/new'); close(); } },
      { id: 'act-new-journal', group: 'Actions', label: 'New journal entry', hint: 'J', Icon: Pencil, run: () => { router.push('/dashboard/journal'); close(); } },
      { id: 'act-theme', group: 'Actions', label: `Toggle theme (${preference})`, Icon: SunMoon, run: cycleTheme },
      { id: 'act-shortcuts', group: 'Actions', label: 'Open shortcuts cheatsheet', Icon: Keyboard, run: () => { close(); setTimeout(() => setCheatsheetOpen(true), 0); } },
    ];
    const tradeItems: PaletteItem[] = trades.map((trade) => ({
      id: `trade-${trade.id}`,
      group: 'Trades',
      label: `${trade.symbol} · ${trade.entryDate.slice(0, 10)} · ${trade.pnl === null ? 'open' : `${trade.pnl >= 0 ? '+' : '-'}$${Math.abs(trade.pnl).toFixed(0)}`}`,
      Icon: ListChecks,
      run: () => { router.push(`/dashboard/trades/${trade.id}`); close(); },
    }));
    return [...staticItems, ...tradeItems];
  }, [router, preference, setPreference, setCheatsheetOpen, trades, close]);

  const filtered = useMemo(() => items.filter((item) => fuzzyMatch(query, item.label)), [items, query]);

  useEffect(() => { setSelected(0); }, [query]);

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((value) => Math.min(value + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      filtered[selected]?.run();
    }
  }

  if (!paletteOpen) return null;

  let runningIndex = -1;
  return (
    <div className={styles.backdrop} onClick={close} role="presentation">
      <div className={styles.modal} onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Command palette">
        <input ref={inputRef} className={styles.input} placeholder="Type a command or search trades..." value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKeyDown} />
        <div className={styles.list}>
          {(['Navigation', 'Actions', 'Trades'] as const).map((group) => {
            const groupItems = filtered.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group}>
                <div className={styles.groupLabel}>{group}</div>
                {groupItems.map((item) => {
                  runningIndex++;
                  const index = runningIndex;
                  const Icon = item.Icon;
                  return (
                    <button key={item.id} type="button" className={`${styles.row} ${index === selected ? styles.rowActive : ''}`} onMouseEnter={() => setSelected(index)} onClick={item.run}>
                      {Icon && <Icon size={16} />}
                      <span className={styles.rowLabel}>{item.label}</span>
                      {item.hint && <kbd className={styles.rowHint}>{item.hint}</kbd>}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 && <div className={styles.empty}>No results.</div>}
        </div>
      </div>
    </div>
  );
}
