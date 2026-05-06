// Use a union type for Prisma Decimal-like values
type DecimalLike = { toNumber?: () => number; toString: () => string } | number | string;

export interface TradeForCalc {
  side: 'LONG' | 'SHORT';
  entryPrice: DecimalLike | number;
  exitPrice?: DecimalLike | number | null;
  quantity: DecimalLike | number;
  stopLoss?: DecimalLike | number | null;
  commission: DecimalLike | number;
  pnl?: DecimalLike | number | null;
}

function toNum(val: DecimalLike | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return typeof val === 'number' ? val : Number(val);
}

export function calculatePnl(trade: TradeForCalc): number {
  const entry = toNum(trade.entryPrice);
  const exit = toNum(trade.exitPrice);
  const qty = toNum(trade.quantity);
  const commission = toNum(trade.commission);

  if (!exit) return 0;

  const rawPnl =
    trade.side === 'LONG'
      ? (exit - entry) * qty
      : (entry - exit) * qty;

  return rawPnl - commission;
}

export function calculatePnlPercent(trade: TradeForCalc): number {
  const entry = toNum(trade.entryPrice);
  const qty = toNum(trade.quantity);
  if (!entry || !qty) return 0;

  const pnl = calculatePnl(trade);
  const cost = entry * qty;
  return (pnl / cost) * 100;
}

export function calculateRMultiple(trade: TradeForCalc): number | null {
  const entry = toNum(trade.entryPrice);
  const exit = toNum(trade.exitPrice);
  const sl = toNum(trade.stopLoss);

  if (!exit || !sl) return null;

  const risk = Math.abs(entry - sl);
  if (risk === 0) return null;

  const reward =
    trade.side === 'LONG' ? exit - entry : entry - exit;

  return reward / risk;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
  avgWin: number;
  avgLoss: number;
  payoffRatio: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  bestTrade: number;
  worstTrade: number;
  avgRMultiple: number | null;
  expectancy: number;
  sharpeRatio: number | null;
}

export function calculateMetrics(
  trades: Array<{
    pnl: DecimalLike | number | null;
    rMultiple?: DecimalLike | number | null;
    exitDate?: Date | string | null;
  }>,
  initialBalance = 0
): PerformanceMetrics {
  const pnls = trades.map((t) => toNum(t.pnl)).filter((p) => p !== 0 || trades.length > 0);
  const totalTrades = pnls.length;

  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      avgPnl: 0,
      avgWin: 0,
      avgLoss: 0,
      payoffRatio: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      bestTrade: 0,
      worstTrade: 0,
      avgRMultiple: null,
      expectancy: 0,
      sharpeRatio: null,
    };
  }

  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const winRate = (wins.length / totalTrades) * 100;
  const totalPnl = pnls.reduce((a, b) => a + b, 0);
  const avgPnl = totalPnl / totalTrades;
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0;
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Max drawdown — computed from actual equity level (initialBalance + cumulative PnL)
  let peak = initialBalance;
  let maxDD = 0;
  let running = initialBalance;
  for (const pnl of pnls) {
    running += pnl;
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  }
  const maxDrawdownPercent = peak > 0 ? (maxDD / peak) * 100 : 0;

  // R-Multiples
  const rMultiples = trades
    .map((t) => toNum(t.rMultiple))
    .filter((r) => r !== 0);
  const avgRMultiple =
    rMultiples.length > 0
      ? rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length
      : null;

  // Expectancy
  const lossRate = losses.length / totalTrades;
  const expectancy = (winRate / 100) * avgWin - lossRate * avgLoss;

  // Sharpe Ratio — daily grouping, no annualization (matches FTMO/broker platform)
  let sharpeRatio: number | null = null;
  const dailyPnlMap: Record<string, number> = {};
  for (const trade of trades) {
    if (trade.exitDate) {
      const d = trade.exitDate instanceof Date
        ? trade.exitDate.toISOString().slice(0, 10)
        : String(trade.exitDate).slice(0, 10);
      dailyPnlMap[d] = (dailyPnlMap[d] || 0) + toNum(trade.pnl);
    }
  }
  const dailyValues = Object.values(dailyPnlMap);
  if (dailyValues.length > 1) {
    const dMean = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
    const dVariance = dailyValues.reduce((acc, d) => acc + Math.pow(d - dMean, 2), 0) / (dailyValues.length - 1);
    const dStdDev = Math.sqrt(dVariance);
    sharpeRatio = dStdDev > 0 ? dMean / dStdDev : null;
  }

  return {
    totalTrades,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate,
    totalPnl,
    avgPnl,
    avgWin,
    avgLoss,
    payoffRatio,
    profitFactor,
    maxDrawdown: maxDD,
    maxDrawdownPercent,
    bestTrade: Math.max(...pnls),
    worstTrade: Math.min(...pnls),
    avgRMultiple,
    expectancy,
    sharpeRatio,
  };
}
