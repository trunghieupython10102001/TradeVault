'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Smile, TrendingUp, X } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/calculations';
import { MOODS, type Mood } from '@/lib/moods';
import styles from './page.module.css';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryDate: string;
  exitDate: string | null;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  pnl: number | null;
  commission: number;
  rMultiple: number | null;
  status: string;
}

interface JournalEntry {
  id: string;
  entryDate: string;
  content: string;
  mood: Mood | null;
}

interface DayCell {
  day: number | null;
  date: Date | null;
  dateStr: string | null;
  pnl: number | null;
  trades: Trade[];
  journal: JournalEntry | null;
  mood: Mood | null;
  isToday: boolean;
  isFuture: boolean;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatShortDate(dateStr: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(`${dateStr}T00:00:00`));
}

function getPnlColor(pnl: number): string {
  if (pnl === 0) return 'var(--bg-tertiary)';
  if (pnl > 500) return 'rgba(34, 197, 94, 0.6)';
  if (pnl > 200) return 'rgba(34, 197, 94, 0.35)';
  if (pnl > 0) return 'rgba(34, 197, 94, 0.15)';
  if (pnl > -200) return 'rgba(239, 68, 68, 0.15)';
  if (pnl > -500) return 'rgba(239, 68, 68, 0.35)';
  return 'rgba(239, 68, 68, 0.6)';
}

function tradeNetPnl(trade: Trade) {
  return Number(trade.pnl ?? 0) - Number(trade.commission || 0);
}

function DayDrawer({ cell, onClose }: { cell: DayCell; onClose: () => void }) {
  const router = useRouter();
  const trades = cell.trades;
  const pnl = trades.reduce((sum, trade) => sum + tradeNetPnl(trade), 0);
  const wins = trades.filter((trade) => tradeNetPnl(trade) > 0).length;
  const losses = trades.filter((trade) => tradeNetPnl(trade) < 0).length;
  const best = trades.length ? Math.max(...trades.map(tradeNetPnl)) : null;
  const worst = trades.length ? Math.min(...trades.map(tradeNetPnl)) : null;
  const dateLabel = cell.date ? new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(cell.date) : '';

  return (
    <div className={styles.drawerBackdrop} onClick={onClose} role="presentation">
      <aside className={styles.drawer} onClick={(event) => event.stopPropagation()} role="dialog" aria-label={`Review ${dateLabel}`}>
        <div className={styles.drawerHeader}>
          <h3>{dateLabel}</h3>
          <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close drawer"><X size={18} /></button>
        </div>

        <div className={styles.drawerStats}>
          <div className={styles.drawerStat}>
            <span>P&amp;L</span>
            <strong className={pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>{pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}</strong>
          </div>
          <div className={styles.drawerStat}>
            <span>Trades</span>
            <strong>{trades.length}</strong>
            <small>{wins}W / {losses}L</small>
          </div>
          <div className={styles.drawerStat}>
            <span>Best/Worst</span>
            <strong>
              <span className="pnl-positive">{best !== null && best > 0 ? `+${formatCurrency(best)}` : '—'}</span>
              <span className={styles.statSlash}>/</span>
              <span className="pnl-negative">{worst !== null && worst < 0 ? formatCurrency(worst) : '—'}</span>
            </strong>
          </div>
        </div>

        <section className={styles.drawerSection}>
          <h4>Trades</h4>
          {trades.length === 0 ? (
            <p className={styles.drawerEmpty}>No closed trades on this day.</p>
          ) : trades.map((trade) => {
            const net = tradeNetPnl(trade);
            return (
              <button
                key={trade.id}
                type="button"
                className={styles.drawerTrade}
                onClick={() => { router.push(`/dashboard/trades/${trade.id}`); onClose(); }}
              >
                <span className={`${styles.sideMini} ${trade.side === 'LONG' ? styles.sideLong : styles.sideShort}`}>{trade.side === 'LONG' ? 'L' : 'S'}</span>
                <span className={styles.drawerTradeMain}>
                  <strong>{trade.symbol}</strong>
                  <small>{Number(trade.entryPrice).toFixed(2)} → {trade.exitPrice ? Number(trade.exitPrice).toFixed(2) : '—'} · Qty {Number(trade.quantity)}</small>
                </span>
                {trade.rMultiple != null && <span className={styles.rChip}>{Number(trade.rMultiple).toFixed(1)}R</span>}
                <span className={`${styles.drawerTradePnl} ${net >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>{net >= 0 ? '+' : ''}{formatCurrency(net)}</span>
              </button>
            );
          })}
        </section>

        <section className={styles.drawerSection}>
          <div className={styles.drawerSectionHeader}>
            <h4>Journal</h4>
            {cell.journal && <Link href={`/dashboard/journal#${cell.journal.id}`} onClick={onClose}>Edit</Link>}
          </div>
          {cell.journal ? (
            <div className={styles.journalPreview}>
              {cell.journal.mood && <span className={styles.journalMood} style={{ color: MOODS[cell.journal.mood].color }}>Mood: {MOODS[cell.journal.mood].label}</span>}
              <p>{cell.journal.content || 'Journal entry has no notes.'}</p>
            </div>
          ) : (
            <div className={styles.journalPreview}>
              <p>No entry yet.</p>
              {cell.dateStr && <Link className={styles.createJournalBtn} href={`/dashboard/journal?date=${cell.dateStr}`} onClick={onClose}>Create entry for {formatShortDate(cell.dateStr)}</Link>}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [previousTrades, setPreviousTrades] = useState<Trade[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [view, setView] = useState<'pnl' | 'mood'>('pnl');
  const [selectedCell, setSelectedCell] = useState<DayCell | null>(null);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const todayKey = formatDateKey(new Date());
  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth();

  useEffect(() => {
    async function fetchMonthData() {
      setLoading(true);
      try {
        const startOfMonth = new Date(year, month, 1);
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
        const previousStart = new Date(year, month - 1, 1);
        const previousEnd = new Date(year, month, 0, 23, 59, 59);
        const currentParams = new URLSearchParams({ from: startOfMonth.toISOString(), to: endOfMonth.toISOString(), status: 'CLOSED' });
        const previousParams = new URLSearchParams({ from: previousStart.toISOString(), to: previousEnd.toISOString(), status: 'CLOSED' });

        const [tradeRes, previousRes, journalRes] = await Promise.all([
          apiFetch(`/api/trades?${currentParams.toString()}`),
          apiFetch(`/api/trades?${previousParams.toString()}`),
          apiFetch('/api/journal'),
        ]);
        if (tradeRes.ok) setTrades((await tradeRes.json()).data || []);
        if (previousRes.ok) setPreviousTrades((await previousRes.json()).data || []);
        if (journalRes.ok) setEntries(await journalRes.json());
      } catch {
        console.error('Failed to fetch calendar data');
      } finally {
        setLoading(false);
      }
    }
    fetchMonthData();
  }, [year, month]);

  const tradesByDate = useMemo(() => {
    const result: Record<string, Trade[]> = {};
    trades.forEach((trade) => {
      if (!trade.exitDate) return;
      const dateKey = formatDateKey(new Date(trade.exitDate));
      result[dateKey] = [...(result[dateKey] || []), trade];
    });
    return result;
  }, [trades]);

  const journalByDate = useMemo(() => {
    const result: Record<string, JournalEntry> = {};
    entries.forEach((entry) => { result[formatDateKey(new Date(entry.entryDate))] = entry; });
    return result;
  }, [entries]);

  const cells = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const list: DayCell[] = [];
    for (let i = 0; i < firstDay; i++) list.push({ day: null, date: null, dateStr: null, pnl: null, trades: [], journal: null, mood: null, isToday: false, isFuture: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const dateStr = formatDateKey(date);
      const dayTrades = tradesByDate[dateStr] || [];
      const journal = journalByDate[dateStr] || null;
      const pnl = dayTrades.length ? dayTrades.reduce((sum, trade) => sum + tradeNetPnl(trade), 0) : null;
      list.push({ day: d, date, dateStr, pnl, trades: dayTrades, journal, mood: journal?.mood ?? null, isToday: dateStr === todayKey, isFuture: date > new Date() });
    }
    while (list.length % 7 !== 0) list.push({ day: null, date: null, dateStr: null, pnl: null, trades: [], journal: null, mood: null, isToday: false, isFuture: false });
    return list;
  }, [year, month, tradesByDate, journalByDate, todayKey]);

  const weeks = useMemo(() => {
    const rows: DayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cells]);

  const pnlByDate = useMemo(() => Object.fromEntries(cells.filter((cell) => cell.dateStr && cell.pnl !== null).map((cell) => [cell.dateStr!, cell.pnl!])), [cells]);
  const monthPnl = Object.values(pnlByDate).reduce((a, b) => a + b, 0);
  const previousPnl = previousTrades.reduce((sum, trade) => sum + tradeNetPnl(trade), 0);
  const tradingDays = Object.keys(pnlByDate).length;
  const greenDays = Object.values(pnlByDate).filter((p) => p > 0).length;
  const bestDay = Object.entries(pnlByDate).filter(([, pnl]) => pnl > 0).sort((a, b) => b[1] - a[1])[0];
  const worstDay = Object.entries(pnlByDate).filter(([, pnl]) => pnl < 0).sort((a, b) => a[1] - b[1])[0];
  const delta = monthPnl - previousPnl;
  const deltaPercent = previousPnl !== 0 ? (delta / Math.abs(previousPnl)) * 100 : null;

  const prevMonth = () => setCurrentDate(new Date(year, month - 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1));
  const goToday = () => setCurrentDate(new Date());

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (event.key === 'Escape') setSelectedCell(null);
      if (selectedCell) return;
      if (event.key === 'ArrowLeft') setCurrentDate((date) => new Date(date.getFullYear(), date.getMonth() - 1));
      if (event.key === 'ArrowRight') setCurrentDate((date) => new Date(date.getFullYear(), date.getMonth() + 1));
      if (event.key.toLowerCase() === 't') goToday();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCell]);

  return (
    <>
      <Topbar title="Calendar" subtitle="Visual overview of your trading days" />
      <div className={styles.page}>
        <div className={styles.monthStats}>
          <div className={styles.stat}><span className={styles.statLabel}>Month P&amp;L</span><span className={`${styles.statValue} ${monthPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>{loading ? '—' : formatCurrency(monthPnl)}</span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Trading Days</span><span className={styles.statValue}>{loading ? '—' : tradingDays}</span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Green Days</span><span className={`${styles.statValue} pnl-positive`}>{loading ? '—' : `${greenDays}/${tradingDays}`}</span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Best Day</span><span className={`${styles.statValue} pnl-positive`}>{bestDay ? `${formatShortDate(bestDay[0])} · +${formatCurrency(bestDay[1])}` : '—'}</span></div>
          <div className={styles.stat}><span className={styles.statLabel}>Worst Day</span><span className={`${styles.statValue} pnl-negative`}>{worstDay ? `${formatShortDate(worstDay[0])} · ${formatCurrency(worstDay[1])}` : '—'}</span></div>
        </div>
        <div className={`${styles.monthDelta} ${delta >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
          vs previous month: {delta >= 0 ? '+' : ''}{formatCurrency(delta)} {deltaPercent === null ? '(new high)' : `(${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(0)}%)`}
        </div>

        <div className={styles.calendar}>
          <div className={styles.calHeader}>
            <div className={styles.headerControls}>
              <button onClick={prevMonth} className={styles.navBtn} disabled={loading} aria-label="Previous month"><ChevronLeft size={18} /></button>
              <button onClick={goToday} className={styles.todayBtn} disabled={isCurrentMonth}>Today</button>
            </div>
            <div className={styles.calTitleGroup}>
              <h2 className={styles.monthTitle}>{MONTHS[month]} {year}</h2>
              <div className={styles.viewToggle} role="radiogroup" aria-label="Calendar view">
                <button className={view === 'pnl' ? styles.viewActive : ''} onClick={() => setView('pnl')} type="button" role="radio" aria-checked={view === 'pnl'}><TrendingUp size={14} /> P&amp;L</button>
                <button className={view === 'mood' ? styles.viewActive : ''} onClick={() => setView('mood')} type="button" role="radio" aria-checked={view === 'mood'}><Smile size={14} /> Mood</button>
              </div>
            </div>
            <button onClick={nextMonth} className={styles.navBtn} disabled={loading} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>

          <div className={styles.dayHeaders}>{DAYS.map((d) => <div key={d} className={styles.dayHeader}>{d}</div>)}<div className={`${styles.dayHeader} ${styles.weekHeader}`}>Week</div></div>

          {loading ? <div className={styles.loadingState}><div className={styles.spinner} /><span>Loading trades...</span></div> : (
            <div className={styles.grid}>
              {weeks.map((week, weekIndex) => {
                const weekPnl = week.reduce((sum, cell) => sum + (cell.pnl ?? 0), 0);
                const weekTrades = week.reduce((sum, cell) => sum + cell.trades.length, 0);
                return (
                  <div key={weekIndex} className={styles.weekRow}>
                    {week.map((cell, i) => {
                      const hasContent = !!cell.day && (cell.pnl !== null || cell.journal || !cell.isFuture);
                      const background = !cell.day || cell.isFuture ? undefined : view === 'mood' ? (cell.mood ? MOODS[cell.mood].background : 'var(--bg-glass)') : cell.pnl !== null ? getPnlColor(cell.pnl) : undefined;
                      return (
                        <button
                          key={`${weekIndex}-${i}`}
                          type="button"
                          className={`${styles.cell} ${cell.day ? styles.cellActive : ''} ${cell.pnl !== null ? styles.cellHasTrade : ''} ${cell.isToday ? styles.todayCell : ''} ${cell.isFuture ? styles.futureCell : ''}`}
                          style={{ background, borderColor: cell.mood ? MOODS[cell.mood].color : undefined }}
                          onClick={() => hasContent && setSelectedCell(cell)}
                          disabled={!cell.day || cell.isFuture}
                        >
                          {cell.day && <><span className={styles.cellDay}>{cell.day}</span>{cell.pnl !== null && <span className={`${styles.cellPnl} ${cell.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>{cell.pnl >= 0 ? '+' : ''}{formatCurrency(cell.pnl).replace('$', '')}</span>}{cell.journal && <span className={styles.moodBadge} style={{ background: cell.mood ? MOODS[cell.mood].color : 'var(--text-muted)' }} title={cell.mood ? `Mood: ${MOODS[cell.mood].label}` : 'Journal entry'} aria-label={cell.mood ? `Mood: ${MOODS[cell.mood].label}` : 'Journal entry'} />}</>}
                        </button>
                      );
                    })}
                    <div className={styles.weekCell}><strong className={weekPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>{weekPnl >= 0 ? '+' : ''}{formatCurrency(weekPnl).replace('.00', '')}</strong><span>{weekTrades > 0 ? `${weekTrades} trades` : '—'}</span></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {selectedCell && <DayDrawer cell={selectedCell} onClose={() => setSelectedCell(null)} />}
    </>
  );
}
