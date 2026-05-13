'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  PieChart,
  BarChart3,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Globe,
  Activity,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import Topbar from '@/components/layout/Topbar';
import { HeatmapCard, type DayHourRow } from '@/components/HeatmapCard';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatNumber } from '@/lib/calculations';
import styles from './page.module.css';

const STRATEGY_COLORS = [
  '#6366f1', '#22c55e', '#ef4444', '#f59e0b', '#a855f7',
  '#3b82f6', '#06b6d4', '#f97316', '#ec4899', '#84cc16',
];

const SESSION_COLORS: Record<string, string> = {
  Asian: '#06b6d4',
  London: '#6366f1',
  'New York': '#22c55e',
  'Off Hours': '#94a3b8',
};

interface Stats {
  equity: number;
  balance: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  totalLots: number;
  sharpeRatio: number | null;
  avgRMultiple: number | null;
  expectancy: number;
  profitFactor: number | null;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  bestTrade: number;
  worstTrade: number;
  totalPnl: number;
}

interface StrategyRow { name: string; trades: number; winRate: number; pnl: number }
interface SymbolRow { symbol: string; trades: number; winRate: number; pnl: number }
interface DayRow { day: string; trades: number; winRate: number; pnl: number }
interface SessionRow { session: string; trades: number; winRate: number; pnl: number; lots: number }
interface HourRow { hour: number; trades: number; winRate: number; pnl: number }
interface EquityPoint { date: string; equity: number }

interface AnalyticsData {
  stats: Stats;
  equityCurve: EquityPoint[];
  byStrategy: StrategyRow[];
  bySymbol: SymbolRow[];
  byDay: DayRow[];
  bySession: SessionRow[];
  byHour: HourRow[];
  byDayHour: DayHourRow[];
  drawdown: number[];
  maxDrawdown: number;
  totalTrades: number;
}

function fmt(n: number | null, decimals = 2): string {
  if (n === null) return '—';
  return formatNumber(n, decimals);
}

function Skeleton({ h, w = '100%' }: { h: string; w?: string }) {
  return <div className={styles.skeleton} style={{ height: h, width: w }} />;
}

function AnalyticsSkeleton() {
  return (
    <>
      <div className={styles.card}>
        <Skeleton h="18px" w="110px" />
        <div style={{ marginTop: 'var(--space-5)' }}>
          <div className={`${styles.statsGrid} ${styles.statsGrid2Col}`} style={{ marginBottom: 'var(--space-3)' }}>
            <Skeleton h="84px" />
            <Skeleton h="84px" />
          </div>
          <div className={styles.statsGrid} style={{ marginBottom: 'var(--space-3)' }}>
            <Skeleton h="76px" />
            <Skeleton h="76px" />
            <Skeleton h="76px" />
          </div>
          <div className={styles.statsGrid} style={{ marginBottom: 'var(--space-3)' }}>
            <Skeleton h="76px" />
            <Skeleton h="76px" />
            <Skeleton h="76px" />
          </div>
          <div className={styles.statsGrid}>
            <Skeleton h="76px" />
            <Skeleton h="76px" />
            <Skeleton h="76px" />
          </div>
        </div>
      </div>
      <div className={styles.card}>
        <Skeleton h="18px" w="130px" />
        <div style={{ marginTop: 'var(--space-5)' }}>
          <Skeleton h="280px" />
        </div>
      </div>
      <div className={styles.grid2}>
        {[4, 5].map((lines, ci) => (
          <div key={ci} className={styles.card}>
            <Skeleton h="18px" w="150px" />
            <div style={{ marginTop: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {Array.from({ length: lines }).map((_, i) => <Skeleton key={i} h="44px" />)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
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
        if (res.ok) setData(await res.json());
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
  const maxSessionPnl = data ? Math.max(...data.bySession.map((s) => Math.abs(s.pnl)), 1) : 1;
  const maxDayPnl = data ? Math.max(...data.byDay.map((d) => Math.abs(d.pnl)), 1) : 1;

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

        {loading && <AnalyticsSkeleton />}

        {!loading && data && data.totalTrades === 0 && (
          <div className={styles.emptyState}>
            <TrendingUp size={40} />
            <h3>No closed trades in this period</h3>
            <p>Log some trades and close them to see your analytics.</p>
          </div>
        )}

        {!loading && data && data.totalTrades > 0 && (
          <>
            {/* ===== Statistics Panel ===== */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}><Activity size={18} /> Statistics</h3>
                <span className={styles.cardMetaNeutral}>{data.totalTrades} trades</span>
              </div>

              {/* Hero: Equity + Total P&L */}
              <div className={`${styles.statsGrid} ${styles.statsGrid2Col}`} style={{ marginBottom: 'var(--space-3)' }}>
                <div className={`${styles.statTile} ${styles.statTileHero}`}>
                  <span className={styles.statTileLabel}>Equity</span>
                  <span className={styles.statTileValue}>{formatCurrency(data.stats.equity)}</span>
                </div>
                <div className={`${styles.statTile} ${styles.statTileHero}`}>
                  <span className={styles.statTileLabel}>Total P&amp;L</span>
                  <span className={`${styles.statTileValue} ${data.stats.totalPnl >= 0 ? 'positive' : 'negative'}`}>
                    {data.stats.totalPnl >= 0 ? '+' : ''}{formatCurrency(data.stats.totalPnl)}
                  </span>
                </div>
              </div>

              {/* Row 1: Win Rate, Avg Profit, Avg Loss */}
              <div className={styles.statsGrid} style={{ marginBottom: 'var(--space-3)' }}>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Win Rate</span>
                  <span className={`${styles.statTileValue} ${data.stats.winRate >= 50 ? 'positive' : 'warn'}`}>
                    {fmt(data.stats.winRate, 1)}%
                  </span>
                  <div className={styles.statMiniBar}>
                    <div
                      className={styles.statMiniBarFill}
                      style={{
                        width: `${data.stats.winRate}%`,
                        background: data.stats.winRate >= 50 ? 'var(--green)' : '#f59e0b',
                      }}
                    />
                  </div>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Avg Profit</span>
                  <span className={`${styles.statTileValue} positive`}>
                    +{formatCurrency(data.stats.avgWin)}
                  </span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Avg Loss</span>
                  <span className={`${styles.statTileValue} negative`}>
                    {formatCurrency(data.stats.avgLoss)}
                  </span>
                </div>
              </div>

              {/* Row 2: Trades, Lots, Sharpe */}
              <div className={styles.statsGrid} style={{ marginBottom: 'var(--space-3)' }}>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Trades</span>
                  <span className={styles.statTileValue}>{data.stats.totalTrades}</span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Total Lots</span>
                  <span className={styles.statTileValue}>{fmt(data.stats.totalLots, 2)}</span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Sharpe Ratio</span>
                  <span className={`${styles.statTileValue} ${(data.stats.sharpeRatio ?? 0) >= 0 ? '' : 'negative'}`}>
                    {fmt(data.stats.sharpeRatio, 2)}
                  </span>
                </div>
              </div>

              {/* Row 3: Avg RRR, Expectancy, Profit Factor */}
              <div className={styles.statsGrid} style={{ marginBottom: 'var(--space-3)' }}>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Avg RRR</span>
                  <span className={`${styles.statTileValue} ${(data.stats.avgRMultiple ?? 0) >= 1 ? 'positive' : 'warn'}`}>
                    {fmt(data.stats.avgRMultiple, 2)}
                  </span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Expectancy</span>
                  <span className={`${styles.statTileValue} ${data.stats.expectancy >= 0 ? 'positive' : 'negative'}`}>
                    {data.stats.expectancy >= 0 ? '+' : ''}{formatCurrency(data.stats.expectancy)}
                  </span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Profit Factor</span>
                  <span className={`${styles.statTileValue} ${(data.stats.profitFactor ?? 0) >= 1 ? 'positive' : 'negative'}`}>
                    {fmt(data.stats.profitFactor, 2)}
                  </span>
                </div>
              </div>

              {/* Row 4: Max Drawdown, Best Trade, Worst Trade */}
              <div className={styles.statsGrid}>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Max Drawdown</span>
                  <span className={`${styles.statTileValue} negative`}>
                    {fmt(data.stats.maxDrawdownPercent, 1)}%
                  </span>
                  <span className={styles.statTileSub}>{formatCurrency(Math.abs(data.stats.maxDrawdown))}</span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Best Trade</span>
                  <span className={`${styles.statTileValue} positive`}>
                    +{formatCurrency(data.stats.bestTrade)}
                  </span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Worst Trade</span>
                  <span className={`${styles.statTileValue} negative`}>
                    {formatCurrency(data.stats.worstTrade)}
                  </span>
                </div>
              </div>
            </div>

            {/* ===== Equity Curve ===== */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}><TrendingUp size={18} /> Equity Curve</h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  Max drawdown: <span style={{ color: 'var(--red)', fontWeight: 600 }}>{fmt(data.maxDrawdown, 2)}%</span>
                </span>
              </div>
              <div className={styles.equityChart}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.equityCurve} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="analyticsEquity" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="date" stroke="transparent" fontSize={11} tickLine={false}
                      axisLine={false} tick={{ fill: '#556582' }}
                      interval={Math.floor(data.equityCurve.length / 6)}
                    />
                    <YAxis
                      stroke="transparent" fontSize={11} tickLine={false} axisLine={false}
                      tick={{ fill: '#556582' }} domain={['auto', 'auto']}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={44}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0e1628', border: '1px solid rgba(124,140,255,0.18)', borderRadius: '10px', fontSize: '12px' }}
                      itemStyle={{ color: '#f5f7ff' }}
                      labelStyle={{ color: '#7182ab', marginBottom: '4px', fontSize: '11px' }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [`$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Equity']}
                    />
                    <Area
                      type="monotone" dataKey="equity" stroke="#6366f1" strokeWidth={2}
                      fillOpacity={1} fill="url(#analyticsEquity)" dot={false}
                      activeDot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ===== Session + Day ===== */}
            <div className={styles.grid2}>
              {/* By Session */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}><Globe size={18} /> Performance by Session</h3>
                </div>
                {data.bySession.length === 0 ? (
                  <p className={styles.cardEmpty}>No session data available.</p>
                ) : (
                  <table className={styles.sessionTable}>
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Trades</th>
                        <th>Win %</th>
                        <th>Lots</th>
                        <th>P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.bySession.map((s) => (
                        <tr key={s.session} className={styles.sessionRow}>
                          <td>
                            <span className={styles.sessionBadge}>
                              <span className={styles.sessionDot} style={{ background: SESSION_COLORS[s.session] }} />
                              {s.session}
                            </span>
                          </td>
                          <td className={styles.sessionCell}>{s.trades}</td>
                          <td className={styles.sessionCell}>
                            {fmt(s.winRate, 0)}%
                            <div className={styles.sessionWinBar}>
                              <div
                                className={styles.sessionWinBarFill}
                                style={{
                                  width: `${s.winRate}%`,
                                  background: s.winRate >= 50 ? 'var(--green)' : '#f59e0b',
                                }}
                              />
                            </div>
                          </td>
                          <td className={styles.sessionCell}>{fmt(s.lots, 2)}</td>
                          <td className={styles.sessionCellPnl} style={{ color: s.pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {s.pnl >= 0 ? '+' : ''}{formatCurrency(s.pnl)}
                            <div className={styles.sessionBar}>
                              <div
                                className={styles.sessionBarFill}
                                style={{
                                  width: `${(Math.abs(s.pnl) / maxSessionPnl) * 100}%`,
                                  background: s.pnl >= 0 ? 'var(--green)' : 'var(--red)',
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* By Day of Week */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}><Calendar size={18} /> Performance by Day</h3>
                </div>
                {data.byDay.length === 0 ? (
                  <p className={styles.cardEmpty}>No day-of-week data available.</p>
                ) : (
                  <div className={styles.dayList}>
                    {data.byDay.map((d) => (
                      <div key={d.day} className={styles.dayRow}>
                        <div className={styles.dayRowContent}>
                          <div className={styles.dayInfo}>
                            <span className={styles.dayName}>{d.day}</span>
                            <span className={styles.dayMeta}>{d.trades} trades</span>
                          </div>
                          <div className={styles.dayStats}>
                            <span className={styles.dayWinRate}>{fmt(d.winRate, 0)}%</span>
                            <span className={d.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                              {d.pnl >= 0 ? '+' : ''}{formatCurrency(d.pnl)}
                            </span>
                          </div>
                        </div>
                        <div className={styles.dayBarTrack}>
                          <div
                            className={styles.dayBarFill}
                            style={{
                              width: `${(Math.abs(d.pnl) / maxDayPnl) * 100}%`,
                              background: d.pnl >= 0 ? 'var(--green)' : 'var(--red)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ===== Hour of Day ===== */}
            <HeatmapCard rows={data.byDayHour ?? []} />

            <div className={styles.grid2}>
              {/* By Strategy */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}><PieChart size={18} /> Performance by Strategy</h3>
                </div>
                {data.byStrategy.length === 0 ? (
                  <p className={styles.cardEmpty}>No strategy data available.</p>
                ) : (
                  <div className={styles.strategyList}>
                    {data.byStrategy.map((s, i) => (
                      <div key={s.name} className={styles.strategyRow}>
                        <div className={styles.strategyInfo}>
                          <div className={styles.strategyDot} style={{ background: STRATEGY_COLORS[i % STRATEGY_COLORS.length] }} />
                          <div>
                            <span className={styles.strategyName}>{s.name}</span>
                            <span className={styles.strategyMeta}>{s.trades} trades · {fmt(s.winRate, 1)}% WR</span>
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

              {/* Top Symbols */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}><BarChart3 size={18} /> Top Symbols</h3>
                  <span className={styles.cardMetaNeutral}>{data.totalTrades} trades</span>
                </div>
                {data.bySymbol.length === 0 ? (
                  <p className={styles.cardEmpty}>No symbol data available.</p>
                ) : (
                  <div className={styles.strategyList}>
                    {data.bySymbol.slice(0, 6).map((s) => (
                      <div key={s.symbol} className={styles.strategyRow}>
                        <div className={styles.strategyInfo}>
                          <div>
                            <span className={styles.strategyName} style={{ fontFamily: 'var(--font-mono)' }}>{s.symbol}</span>
                            <span className={styles.strategyMeta}>{s.trades} trades · {fmt(s.winRate, 0)}% WR</span>
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
                              style={{ width: `${(Math.abs(s.pnl) / maxSymPnl) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
