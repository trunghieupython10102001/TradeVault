'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  PieChart,
  BarChart3,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import Topbar from '@/components/layout/Topbar';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import styles from './page.module.css';

const STRATEGY_COLORS = [
  '#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#a855f7',
  '#3b82f6', '#06b6d4', '#f97316', '#ec4899', '#84cc16',
];

interface StrategyRow { name: string; trades: number; winRate: number; pnl: number }
interface SymbolRow { symbol: string; trades: number; winRate: number; pnl: number }
interface DayRow { day: string; trades: number; winRate: number; pnl: number }

interface AnalyticsData {
  byStrategy: StrategyRow[];
  bySymbol: SymbolRow[];
  byDay: DayRow[];
  drawdown: number[];
  maxDrawdown: number;
  totalTrades: number;
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('all');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/analytics?period=${period}`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch {
        console.error('Failed to fetch analytics');
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [period]);

  const maxStratPnl = data ? Math.max(...data.byStrategy.map((s) => Math.abs(s.pnl)), 1) : 1;
  const maxSymPnl = data ? Math.max(...data.bySymbol.map((s) => Math.abs(s.pnl)), 1) : 1;
  const maxDD = data && data.drawdown.length > 0 ? Math.max(...data.drawdown.map(Math.abs), 0.001) : 0.001;

  return (
    <>
      <Topbar title="Analytics" subtitle="Deep dive into your trading performance" />
      <div className={styles.page}>
        {/* Period Selector */}
        <div className={styles.periodBar}>
          {['1W', '1M', '3M', '6M', 'YTD', 'All'].map((p) => {
            const val = p.toLowerCase();
            return (
              <button
                key={p}
                className={`${styles.periodBtn} ${period === val ? styles.periodActive : ''}`}
                onClick={() => setPeriod(val)}
              >
                {p}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading analytics...</span>
          </div>
        )}

        {!loading && data && data.totalTrades === 0 && (
          <div className={styles.emptyState}>
            <TrendingUp size={40} />
            <h3>No closed trades in this period</h3>
            <p>Log some trades and close them to see your analytics.</p>
          </div>
        )}

        {!loading && data && data.totalTrades > 0 && (
          <>
            {/* Drawdown Chart */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>
                  <TrendingUp size={18} /> Drawdown
                </h3>
                <span className={styles.cardMeta}>
                  Max: {formatNumber(data.maxDrawdown, 2)}%
                </span>
              </div>
              <div className={styles.drawdownChart}>
                <svg viewBox="0 0 400 100" className={styles.chartSvg}>
                  <defs>
                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--red)" stopOpacity="0" />
                      <stop offset="100%" stopColor="var(--red)" stopOpacity="0.3" />
                    </linearGradient>
                  </defs>
                  <line
                    x1="10" y1="10" x2="390" y2="10"
                    stroke="var(--border-secondary)"
                    strokeWidth="0.5"
                    strokeDasharray="4"
                  />
                  {data.drawdown.length > 1 && (
                    <>
                      <path
                        d={`M 10,10 ${data.drawdown.map((d, i) =>
                          `L ${10 + (i / (data.drawdown.length - 1)) * 380},${10 + (Math.abs(d) / maxDD) * 80}`
                        ).join(' ')} L 390,10 Z`}
                        fill="url(#ddGrad)"
                      />
                      <polyline
                        points={data.drawdown.map((d, i) =>
                          `${10 + (i / (data.drawdown.length - 1)) * 380},${10 + (Math.abs(d) / maxDD) * 80}`
                        ).join(' ')}
                        fill="none"
                        stroke="var(--red)"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </>
                  )}
                </svg>
              </div>
            </div>

            <div className={styles.grid2}>
              {/* By Strategy */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>
                    <PieChart size={18} /> Performance by Strategy
                  </h3>
                </div>
                {data.byStrategy.length === 0 ? (
                  <p className={styles.cardEmpty}>No strategy data available.</p>
                ) : (
                  <div className={styles.strategyList}>
                    {data.byStrategy.map((s, i) => (
                      <div key={s.name} className={styles.strategyRow}>
                        <div className={styles.strategyInfo}>
                          <div
                            className={styles.strategyDot}
                            style={{ background: STRATEGY_COLORS[i % STRATEGY_COLORS.length] }}
                          />
                          <div>
                            <span className={styles.strategyName}>{s.name}</span>
                            <span className={styles.strategyMeta}>
                              {s.trades} trades · {formatNumber(s.winRate, 1)}% WR
                            </span>
                          </div>
                        </div>
                        <div className={styles.strategyPnl}>
                          <span className={s.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                            {s.pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {formatCurrency(Math.abs(s.pnl))}
                          </span>
                          <div className={styles.strategyBar}>
                            <div
                              className={`${styles.strategyBarFill} ${s.pnl >= 0 ? styles.barGreen : styles.barRed}`}
                              style={{ width: `${(Math.abs(s.pnl) / maxStratPnl) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* By Day of Week */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>
                    <Calendar size={18} /> Performance by Day
                  </h3>
                </div>
                {data.byDay.length === 0 ? (
                  <p className={styles.cardEmpty}>No day-of-week data available.</p>
                ) : (
                  <div className={styles.dayList}>
                    {data.byDay.map((d) => (
                      <div key={d.day} className={styles.dayRow}>
                        <div className={styles.dayInfo}>
                          <span className={styles.dayName}>{d.day}</span>
                          <span className={styles.dayMeta}>{d.trades} trades</span>
                        </div>
                        <div className={styles.dayStats}>
                          <span className={styles.dayWinRate}>{formatNumber(d.winRate, 0)}%</span>
                          <span className={d.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                            {formatCurrency(d.pnl)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Top Symbols */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>
                  <BarChart3 size={18} /> Top Symbols
                </h3>
                <span className={styles.cardMeta}>{data.totalTrades} trades total</span>
              </div>
              {data.bySymbol.length === 0 ? (
                <p className={styles.cardEmpty}>No symbol data available.</p>
              ) : (
                <div className={styles.symbolGrid}>
                  {data.bySymbol.map((s) => (
                    <div key={s.symbol} className={styles.symbolCard}>
                      <div className={styles.symbolHeader}>
                        <span className={styles.symbolName}>{s.symbol}</span>
                        <span className={`${styles.symbolPnl} ${s.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                          {formatCurrency(s.pnl)}
                        </span>
                      </div>
                      <div className={styles.symbolMeta}>
                        <span>{s.trades} trades</span>
                        <span>{formatNumber(s.winRate, 0)}% WR</span>
                      </div>
                      <div className={styles.symbolBarTrack}>
                        <div
                          className={`${styles.symbolBarFill} ${s.pnl >= 0 ? styles.barGreen : styles.barRed}`}
                          style={{ width: `${(Math.abs(s.pnl) / maxSymPnl) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
