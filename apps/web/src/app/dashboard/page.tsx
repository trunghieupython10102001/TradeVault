'use client';

import { useEffect, useState } from 'react';
import {
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Target,
  Sigma,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import Topbar from '@/components/layout/Topbar';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatPercent } from '@/lib/calculations';
import styles from './page.module.css';
import Link from 'next/link';

interface DashboardSummary {
  totalPnl: number;
  winRate: number;
  winningTrades: number;
  losingTrades: number;
  profitFactor: number | null;
  maxDrawdownPercent: number;
  totalTrades: number;
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
  payoffRatio: number | null;
  expectancy: number;
  avgRMultiple: number | null;
  maxWinStreak: number | null;
  maxLossStreak: number | null;
  sharpeRatio: number | null;
}

interface EquityPoint {
  date: string;
  equity: number;
}

interface DailyPnlPoint {
  date: string;
  value: number;
}

interface RecentTrade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  status: 'OPEN' | 'CLOSED';
  entryDate: string;
  pnl: number;
  pnlPercent: number | null;
}

interface DashboardData {
  summary: DashboardSummary;
  equityCurve: EquityPoint[];
  dailyPnl: DailyPnlPoint[];
  recentTrades: RecentTrade[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await apiFetch('/api/dashboard');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <>
        <Topbar title="Dashboard" subtitle="Performance overview" />
        <div className={styles.page}>
          <div className={styles.skeletonRibbon}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={styles.skeletonRibbonItem}>
                <div className={`skeleton ${styles.skeletonLabelLine}`} />
                <div className={`skeleton ${styles.skeletonValueLine}`} />
                <div className={`skeleton ${styles.skeletonMetaLine}`} />
              </div>
            ))}
          </div>
          <div className={styles.metricsGrid}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={styles.metricCard}>
                <div className={`skeleton ${styles.skeletonTitleRow}`} />
                <div className={`skeleton ${styles.skeletonBigValue}`} />
                <div className={`skeleton ${styles.skeletonSubLine}`} />
              </div>
            ))}
          </div>
          <div className={styles.chartsGrid}>
            <div className={`skeleton ${styles.chartCardSkeleton}`} />
            <div className={`skeleton ${styles.chartCardSkeleton}`} />
          </div>
        </div>
      </>
    );
  }

  if (!data) {
    return <div className={styles.error}>Failed to load data</div>;
  }

  const { summary, equityCurve, dailyPnl, recentTrades } = data;

  return (
    <>
      <Topbar title="Dashboard" subtitle="Performance overview" />
      <div className={styles.page}>
        <section className={styles.perfRibbon}>
          <div className={styles.ribbonItem}>
            <span className={styles.ribbonLabel}>Net P&L</span>
            <span className={`${styles.ribbonValue} ${summary.totalPnl >= 0 ? styles.positive : styles.negative}`}>
              {formatCurrency(summary.totalPnl)}
            </span>
            <span className={styles.ribbonMeta}>All-time realized</span>
          </div>
          <div className={styles.ribbonItem}>
            <span className={styles.ribbonLabel}>Win Rate</span>
            <span className={styles.ribbonValue}>{formatPercent(summary.winRate)}</span>
            <span className={styles.ribbonMeta}>{summary.winningTrades}W · {summary.losingTrades}L</span>
          </div>
          <div className={styles.ribbonItem}>
            <span className={styles.ribbonLabel}>Profit Factor</span>
            <span className={styles.ribbonValue}>
              {typeof summary.profitFactor === 'number' ? summary.profitFactor.toFixed(2) : '—'}
            </span>
            <span className={styles.ribbonMeta}>Gross ratio</span>
          </div>
          <div className={styles.ribbonItem}>
            <span className={styles.ribbonLabel}>Max Drawdown</span>
            <span className={`${styles.ribbonValue} ${styles.negative}`}>
              {formatPercent(-summary.maxDrawdownPercent)}
            </span>
            <span className={styles.ribbonMeta}>Peak to trough</span>
          </div>
          <div className={styles.ribbonItem}>
            <span className={styles.ribbonLabel}>Expectancy</span>
            <span className={`${styles.ribbonValue} ${summary.expectancy >= 0 ? styles.positive : styles.negative}`}>
              {formatCurrency(summary.expectancy)}
            </span>
            <span className={styles.ribbonMeta}>Per trade avg</span>
          </div>
          <div className={styles.ribbonItem}>
            <span className={styles.ribbonLabel}>Total Trades</span>
            <span className={styles.ribbonValue}>{summary.totalTrades}</span>
            <span className={styles.ribbonMeta}>Closed positions</span>
          </div>
        </section>

        <div className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricTitle}>Total P&L</span>
              <div className={`${styles.metricIcon} ${styles.iconGreen}`}>
                <DollarSign size={14} />
              </div>
            </div>
            <div className={`${styles.metricValue} ${summary.totalPnl >= 0 ? styles.positive : styles.negative}`}>
              {formatCurrency(summary.totalPnl)}
            </div>
            <div className={`${styles.metricChange} ${summary.totalPnl >= 0 ? styles.positive : styles.negative}`}>
              {summary.totalPnl >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              <span>All time</span>
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricTitle}>Win Rate</span>
              <div className={`${styles.metricIcon} ${styles.iconBlue}`}>
                <Target size={14} />
              </div>
            </div>
            <div className={styles.metricValue}>{formatPercent(summary.winRate)}</div>
            <div className={styles.metricSub}>
              {summary.winningTrades}W &nbsp;·&nbsp; {summary.losingTrades}L
            </div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricTitle}>Profit Factor</span>
              <div className={`${styles.metricIcon} ${styles.iconPurple}`}>
                <Sigma size={14} />
              </div>
            </div>
            <div className={styles.metricValue}>
              {typeof summary.profitFactor === 'number' ? summary.profitFactor.toFixed(2) : '0.00'}
            </div>
            <div className={styles.metricSub}>Gross profit / loss</div>
          </div>

          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span className={styles.metricTitle}>Max Drawdown</span>
              <div className={`${styles.metricIcon} ${styles.iconOrange}`}>
                <TrendingDown size={14} />
              </div>
            </div>
            <div className={`${styles.metricValue} ${styles.negative}`}>
              {formatPercent(-summary.maxDrawdownPercent)}
            </div>
            <div className={styles.metricSub}>Peak to trough</div>
          </div>
        </div>

        <div className={styles.chartsGrid}>
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>Equity Curve</h3>
                <p className={styles.chartSubtitle}>Account growth over time</p>
              </div>
            </div>
            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,40,68,0.8)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="transparent"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#556582' }}
                  />
                  <YAxis
                    stroke="transparent"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#556582' }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    width={44}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0e1628', border: '1px solid rgba(124,140,255,0.18)', borderRadius: '10px', fontSize: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                    itemStyle={{ color: '#f5f7ff' }}
                    labelStyle={{ color: '#7182ab', marginBottom: '4px', fontSize: '11px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorEquity)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#818cf8', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>Daily P&L</h3>
                <p className={styles.chartSubtitle}>Session-to-session volatility</p>
              </div>
            </div>
            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyPnl} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,40,68,0.8)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="transparent"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#556582' }}
                  />
                  <YAxis
                    stroke="transparent"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#556582' }}
                    tickFormatter={(v) => `$${v}`}
                    width={52}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1c2845', border: '1px solid #243458', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#f0f4ff' }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {dailyPnl?.map((entry: DailyPnlPoint, index: number) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.value >= 0 ? '#22c55e' : '#f87171'}
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className={styles.bottomRow}>
          <div className={styles.recentTrades}>
            <div className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>Recent Trades</h3>
                <p className={styles.chartSubtitle}>Most recent executions and outcomes</p>
              </div>
              <Link href="/dashboard/trades" className={styles.viewAll}>View all →</Link>
            </div>
            <div className={styles.tradesList}>
              {recentTrades && recentTrades.map((trade: RecentTrade) => (
                <div key={trade.id} className={styles.tradeRow}>
                  <div className={styles.tradeInfo}>
                    <div className={styles.tradeSymbol}>
                      <span className={styles.symbolText}>{trade.symbol}</span>
                      <span className={`badge ${trade.side === 'LONG' ? 'badge-long' : 'badge-short'}`}>
                        {trade.side}
                      </span>
                      {trade.status === 'OPEN' && (
                        <span className="badge badge-open">Open</span>
                      )}
                    </div>
                    <div className={styles.tradeMeta}>
                      <Clock size={10} />
                      <span>{new Date(trade.entryDate).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className={styles.tradePnl}>
                    {trade.status === 'CLOSED' ? (
                      <>
                        <span className={trade.pnl >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                          {formatCurrency(trade.pnl)}
                        </span>
                        {trade.pnlPercent != null && (
                          <span className={`${styles.tradePnlPercent} ${trade.pnlPercent >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                            {trade.pnlPercent >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                            {formatPercent(trade.pnlPercent)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="pnl-neutral">—</span>
                    )}
                  </div>
                </div>
              ))}
              {(!recentTrades || recentTrades.length === 0) && (
                <div className={styles.emptyState}>No trades yet. Add your first trade to get started.</div>
              )}
            </div>
          </div>

          <div className={styles.quickStats}>
            <div className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>Quick Stats</h3>
                <p className={styles.chartSubtitle}>Key trading distribution metrics</p>
              </div>
            </div>
            <div className={styles.statsList}>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Total Trades</span>
                <span className={styles.statValue}>{summary.totalTrades}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Best Trade</span>
                <span className={`${styles.statValue} pnl-positive`}>{formatCurrency(summary.bestTrade)}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Worst Trade</span>
                <span className={`${styles.statValue} pnl-negative`}>{formatCurrency(summary.worstTrade)}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Avg Win</span>
                <span className={`${styles.statValue} pnl-positive`}>{formatCurrency(summary.avgWin)}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Avg Loss</span>
                <span className={`${styles.statValue} pnl-negative`}>-{formatCurrency(summary.avgLoss)}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Payoff Ratio</span>
                <span className={styles.statValue}>
                  {typeof summary.payoffRatio === 'number' && isFinite(summary.payoffRatio)
                    ? summary.payoffRatio.toFixed(2) : 'N/A'}
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Expectancy</span>
                <span className={`${styles.statValue} ${summary.expectancy >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                  {formatCurrency(summary.expectancy)}
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Avg R-Multiple</span>
                <span className={`${styles.statValue} ${(summary.avgRMultiple ?? 0) >= 0 ? 'pnl-positive' : 'pnl-negative'}`}>
                  {summary.avgRMultiple != null ? summary.avgRMultiple.toFixed(2) + 'R' : 'N/A'}
                </span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Win Streak</span>
                <span className={`${styles.statValue} pnl-positive`}>{summary.maxWinStreak ?? 0}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Loss Streak</span>
                <span className={`${styles.statValue} pnl-negative`}>{summary.maxLossStreak ?? 0}</span>
              </div>
              <div className={styles.statRow}>
                <span className={styles.statLabel}>Sharpe Ratio</span>
                <span className={styles.statValue}>
                  {typeof summary.sharpeRatio === 'number' ? summary.sharpeRatio.toFixed(2) : 'N/A'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
