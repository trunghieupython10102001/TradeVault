'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  PieChart,
  BarChart3,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Globe,
  Activity,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import Topbar from '@/components/layout/Topbar';
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
  drawdown: number[];
  maxDrawdown: number;
  totalTrades: number;
}

function fmt(n: number | null, decimals = 2): string {
  if (n === null) return '—';
  return formatNumber(n, decimals);
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

  // For hour chart — normalize bar heights
  const hourData = data?.byHour ?? [];
  const maxHourTrades = Math.max(...hourData.map((h) => h.trades), 1);

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
            {/* ===== Statistics Panel ===== */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}><Activity size={18} /> Statistics</h3>
              </div>

              {/* Equity + Balance */}
              <div className={`${styles.statsGrid} ${styles.statsGrid2Col}`} style={{ marginBottom: 'var(--space-3)' }}>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Equity</span>
                  <span className={styles.statTileValue}>{formatCurrency(data.stats.equity)}</span>
                </div>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Total P&amp;L</span>
                  <span className={`${styles.statTileValue} ${data.stats.totalPnl >= 0 ? 'positive' : 'negative'}`}>
                    {data.stats.totalPnl >= 0 ? '+' : ''}{formatCurrency(data.stats.totalPnl)}
                  </span>
                </div>
              </div>

              {/* Row 1 */}
              <div className={styles.statsGrid} style={{ marginBottom: 'var(--space-3)' }}>
                <div className={styles.statTile}>
                  <span className={styles.statTileLabel}>Win Rate</span>
                  <span className={`${styles.statTileValue} ${data.stats.winRate >= 50 ? 'positive' : 'warn'}`}>
                    {fmt(data.stats.winRate, 1)}%
                  </span>
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

              {/* Row 2 */}
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

              {/* Row 3 */}
              <div className={styles.statsGrid}>
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
                      formatter={(v: number) => [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Equity']}
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
                        <th style={{ textAlign: 'right' }}>Trades</th>
                        <th style={{ textAlign: 'right' }}>Win %</th>
                        <th style={{ textAlign: 'right' }}>Lots</th>
                        <th style={{ textAlign: 'right' }}>P&amp;L</th>
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
                          <td className={styles.sessionCell}>{fmt(s.winRate, 0)}%</td>
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
                        <div className={styles.dayInfo}>
                          <span className={styles.dayName}>{d.day}</span>
                          <span className={styles.dayMeta}>{d.trades} trades</span>
                        </div>
                        <div className={styles.dayStats}>
                          <span className={styles.dayWinRate}>{fmt(d.winRate, 0)}%</span>
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

            {/* ===== Hour of Day ===== */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}><Clock size={18} /> Trades by Hour (broker time)</h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  Bar height = trade count · color = P&amp;L
                </span>
              </div>
              {hourData.length === 0 ? (
                <p className={styles.cardEmpty}>No hourly data available.</p>
              ) : (
                <>
                  <div className={styles.hourChart}>
                    {Array.from({ length: 24 }, (_, h) => {
                      const hd = hourData.find((x) => x.hour === h);
                      const height = hd ? Math.max((hd.trades / maxHourTrades) * 100, 4) : 0;
                      const color = !hd ? 'transparent'
                        : hd.pnl > 0 ? 'var(--green)'
                        : hd.pnl < 0 ? 'var(--red)'
                        : 'var(--text-muted)';
                      return (
                        <div key={h} className={styles.hourBarWrap}>
                          <div className={styles.hourBarOuter}>
                            <div
                              className={styles.hourBar}
                              style={{ height: `${height}%`, background: color, opacity: hd ? 0.8 : 0 }}
                            />
                          </div>
                          {h % 3 === 0 && (
                            <span className={styles.hourLabel}>{String(h).padStart(2, '0')}</span>
                          )}
                          {hd && (
                            <div className={styles.hourTooltip}>
                              <div className={styles.hourTooltipRow}>
                                <span>{String(h).padStart(2, '0')}:00</span>
                              </div>
                              <div className={styles.hourTooltipRow}>
                                <span>Trades</span>
                                <strong>{hd.trades}</strong>
                              </div>
                              <div className={styles.hourTooltipRow}>
                                <span>Win %</span>
                                <strong>{fmt(hd.winRate, 0)}%</strong>
                              </div>
                              <div className={styles.hourTooltipRow}>
                                <span>P&amp;L</span>
                                <strong style={{ color }}>{formatCurrency(hd.pnl)}</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className={styles.hourLegend}>
                    <div className={styles.hourLegendItem}>
                      <div className={styles.hourLegendDot} style={{ background: 'var(--green)' }} />
                      <span>Profitable hour</span>
                    </div>
                    <div className={styles.hourLegendItem}>
                      <div className={styles.hourLegendDot} style={{ background: 'var(--red)' }} />
                      <span>Losing hour</span>
                    </div>
                    <div className={styles.hourLegendItem}>
                      <div className={styles.hourLegendDot} style={{ background: 'var(--text-muted)' }} />
                      <span>Break-even</span>
                    </div>
                  </div>
                </>
              )}
            </div>

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

              {/* By Day of Week */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}><BarChart3 size={18} /> Top Symbols</h3>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{data.totalTrades} trades</span>
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
