export function getHeatmapOpacity(value: number, maxAbsValue: number): number {
  if (maxAbsValue <= 0 || value === 0) return 0.08;
  return Math.min(0.88, Math.max(0.18, Math.abs(value) / maxAbsValue));
}

export function getHeatmapColor(pnl: number, maxAbsPnl: number): string {
  const opacity = getHeatmapOpacity(pnl, maxAbsPnl);
  if (pnl > 0) return `rgba(34, 197, 94, ${opacity})`;
  if (pnl < 0) return `rgba(248, 113, 113, ${opacity})`;
  return 'var(--bg-tertiary)';
}

export function getWinRateColor(winRate: number, trades: number): string {
  if (trades === 0) return 'var(--bg-tertiary)';
  if (winRate >= 60) return 'rgba(34, 197, 94, 0.65)';
  if (winRate >= 45) return 'rgba(251, 191, 36, 0.55)';
  return 'rgba(248, 113, 113, 0.58)';
}
