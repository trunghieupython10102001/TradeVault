'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import styles from './TradePicker.module.css';

interface LinkedTrade {
  id: string;
  symbol: string;
  side: string;
  pnl: string | null;
  entryDate: string;
}

interface Props {
  journalId: string | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function TradePicker({ journalId, selectedIds, onChange }: Props) {
  const [trades, setTrades] = useState<LinkedTrade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!journalId) return;
    setLoading(true);
    apiFetch(`/api/journal/${journalId}/trades`)
      .then((r) => r.json())
      .then(setTrades)
      .catch(() => setTrades([]))
      .finally(() => setLoading(false));
  }, [journalId]);

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Link Trades</span>
      {!journalId ? (
        <p className={styles.hint}>Save entry first to link trades from this period.</p>
      ) : loading ? (
        <p className={styles.hint}>Loading...</p>
      ) : trades.length === 0 ? (
        <p className={styles.hint}>No trades found in this period.</p>
      ) : (
        <div className={styles.list}>
          {trades.map((t) => {
            const pnl = t.pnl != null ? Number(t.pnl) : null;
            return (
              <label key={t.id} className={styles.row}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(t.id)}
                  onChange={() => toggle(t.id)}
                  className={styles.checkbox}
                />
                <span className={styles.symbol}>{t.symbol}</span>
                <span className={`${styles.side} ${t.side === 'LONG' ? styles.long : styles.short}`}>
                  {t.side}
                </span>
                {pnl != null && (
                  <span
                    className={styles.pnl}
                    style={{ color: pnl >= 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)' }}
                  >
                    {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
