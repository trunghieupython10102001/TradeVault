'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/calculations';
import styles from './page.module.css';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Trade {
  id: string;
  entryDate: string;
  exitDate: string | null;
  pnl: number | null;
  commission: number;
  status: string;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function getColor(pnl: number): string {
  if (pnl === 0) return 'var(--bg-tertiary)';
  if (pnl > 500) return 'rgba(34, 197, 94, 0.6)';
  if (pnl > 200) return 'rgba(34, 197, 94, 0.35)';
  if (pnl > 0) return 'rgba(34, 197, 94, 0.15)';
  if (pnl > -200) return 'rgba(239, 68, 68, 0.15)';
  if (pnl > -500) return 'rgba(239, 68, 68, 0.35)';
  return 'rgba(239, 68, 68, 0.6)';
}

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Fetch trades for the current month
  useEffect(() => {
    async function fetchTrades() {
      setLoading(true);
      try {
        const startOfMonth = new Date(year, month, 1);
        const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);
        
        const params = new URLSearchParams({
          startDate: startOfMonth.toISOString(),
          endDate: endOfMonth.toISOString(),
          status: 'CLOSED',
        });
        
        const res = await apiFetch(`/api/trades?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setTrades(data.data || []);
        }
      } catch {
        console.error('Failed to fetch trades');
      } finally {
        setLoading(false);
      }
    }
    
    fetchTrades();
  }, [year, month]);

  // Calculate P&L by closed date (exitDate)
  const pnlByDate = useMemo(() => {
    const result: Record<string, number> = {};
    
    trades.forEach((trade) => {
      if (trade.pnl == null || !trade.exitDate) return;
      
      // Net P&L = gross pnl - commission
      const netPnl = Number(trade.pnl) - Number(trade.commission || 0);
      
      // Use exitDate (closed date) for calendar display
      const dateKey = formatDateKey(new Date(trade.exitDate));
      result[dateKey] = (result[dateKey] || 0) + netPnl;
    });
    
    return result;
  }, [trades]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1));

  const cells: Array<{ day: number | null; dateStr: string | null; pnl: number | null }> = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, dateStr: null, pnl: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const pnl = pnlByDate[dateStr] ?? null;
    cells.push({ day: d, dateStr, pnl });
  }

  // Calculate month stats
  const monthPnl = Object.values(pnlByDate).reduce((a, b) => a + b, 0);
  const tradingDays = Object.keys(pnlByDate).length;
  const greenDays = Object.values(pnlByDate).filter((p) => p > 0).length;

  return (
    <>
      <Topbar title="Calendar" subtitle="Visual overview of your trading days" />
      <div className={styles.page}>
        {/* Month Stats */}
        <div className={styles.monthStats}>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Month P&L</span>
            <span className={`${styles.statValue} ${monthPnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
              {loading ? '—' : formatCurrency(monthPnl)}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Trading Days</span>
            <span className={styles.statValue}>{loading ? '—' : tradingDays}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Green Days</span>
            <span className={`${styles.statValue} pnl-positive`}>
              {loading ? '—' : `${greenDays}/${tradingDays}`}
            </span>
          </div>
        </div>

        {/* Calendar */}
        <div className={styles.calendar}>
          <div className={styles.calHeader}>
            <button onClick={prevMonth} className={styles.navBtn} disabled={loading}>
              <ChevronLeft size={18} />
            </button>
            <h2 className={styles.monthTitle}>{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className={styles.navBtn} disabled={loading}>
              <ChevronRight size={18} />
            </button>
          </div>

          <div className={styles.dayHeaders}>
            {DAYS.map((d) => (
              <div key={d} className={styles.dayHeader}>{d}</div>
            ))}
          </div>

          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <span>Loading trades...</span>
            </div>
          ) : (
            <div className={styles.grid}>
              {cells.map((cell, i) => (
                <div
                  key={i}
                  className={`${styles.cell} ${cell.day ? styles.cellActive : ''} ${cell.pnl !== null ? styles.cellHasTrade : ''}`}
                  style={cell.pnl !== null ? { background: getColor(cell.pnl) } : undefined}
                >
                  {cell.day && (
                    <>
                      <span className={styles.cellDay}>{cell.day}</span>
                      {cell.pnl !== null && (
                        <span
                          className={`${styles.cellPnl} ${cell.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}
                        >
                          {cell.pnl >= 0 ? '+' : ''}{formatCurrency(cell.pnl).replace('$', '')}
                        </span>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Empty State */}
        {!loading && tradingDays === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <TrendingUp size={32} />
            </div>
            <span className={styles.emptyText}>No trades this month</span>
          </div>
        )}

        {/* Legend */}
        <div className={styles.legend}>
          <span className={styles.legendLabel}>Less</span>
          <div className={styles.legendBox} style={{ background: 'rgba(239, 68, 68, 0.6)' }} />
          <div className={styles.legendBox} style={{ background: 'rgba(239, 68, 68, 0.35)' }} />
          <div className={styles.legendBox} style={{ background: 'rgba(239, 68, 68, 0.15)' }} />
          <div className={styles.legendBox} style={{ background: 'var(--bg-tertiary)' }} />
          <div className={styles.legendBox} style={{ background: 'rgba(34, 197, 94, 0.15)' }} />
          <div className={styles.legendBox} style={{ background: 'rgba(34, 197, 94, 0.35)' }} />
          <div className={styles.legendBox} style={{ background: 'rgba(34, 197, 94, 0.6)' }} />
          <span className={styles.legendLabel}>More</span>
        </div>
      </div>
    </>
  );
}
