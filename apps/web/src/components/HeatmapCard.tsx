'use client';

import { useState } from 'react';
import { getHeatmapColor, getWinRateColor } from '@/lib/heatmap';
import { formatCurrency } from '@/lib/calculations';
import styles from './HeatmapCard.module.css';

export interface DayHourRow {
  day: number;
  hour: number;
  trades: number;
  winRate: number;
  pnl: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function HeatmapCard({ rows }: { rows: DayHourRow[] }) {
  const [mode, setMode] = useState<'pnl' | 'winRate'>('pnl');
  const maxAbsPnl = Math.max(...rows.map((row) => Math.abs(row.pnl)), 1);

  function getCell(day: number, hour: number) {
    return rows.find((row) => row.day === day && row.hour === hour);
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Time-of-Day Heatmap</h3>
          <p className={styles.subtitle}>Entry timing by weekday and broker hour</p>
        </div>
        <div className={styles.toggle}>
          <button className={mode === 'pnl' ? styles.active : ''} onClick={() => setMode('pnl')} type="button">P&amp;L</button>
          <button className={mode === 'winRate' ? styles.active : ''} onClick={() => setMode('winRate')} type="button">Win %</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>No time-of-day data available.</p>
      ) : (
        <div className={styles.scroller}>
          <div className={styles.grid}>
            <div className={styles.corner} />
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className={styles.hour}>{hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}</div>
            ))}
            {DAYS.map((dayLabel, day) => (
              <div key={dayLabel} className={styles.rowContents}>
                <div className={styles.day}>{dayLabel}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = getCell(day, hour);
                  const background = !cell
                    ? 'var(--bg-input)'
                    : mode === 'pnl'
                      ? getHeatmapColor(cell.pnl, maxAbsPnl)
                      : getWinRateColor(cell.winRate, cell.trades);
                  return (
                    <div key={hour} className={styles.cell} style={{ background }}>
                      {cell && (
                        <div className={styles.tooltip}>
                          <strong>{dayLabel} {String(hour).padStart(2, '0')}:00</strong>
                          <span>{cell.trades} trades</span>
                          <span>{cell.winRate.toFixed(0)}% win rate</span>
                          <span>{cell.pnl >= 0 ? '+' : ''}{formatCurrency(cell.pnl)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
