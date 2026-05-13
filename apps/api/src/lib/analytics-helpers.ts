import { getDay, getHours } from 'date-fns';

export interface DayHourTrade {
  entryDate: Date | string | null;
  pnl: number | string | null;
}

export interface DayHourRow {
  day: number;
  hour: number;
  trades: number;
  winRate: number;
  pnl: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function aggregateByDayHour(trades: DayHourTrade[]): DayHourRow[] {
  const map: Record<string, { day: number; hour: number; trades: number; wins: number; pnl: number }> = {};

  for (const trade of trades) {
    if (!trade.entryDate) continue;
    const date = new Date(trade.entryDate);
    const day = getDay(date);
    const hour = getHours(date);
    const pnl = Number(trade.pnl) || 0;
    const key = `${day}-${hour}`;

    if (!map[key]) map[key] = { day, hour, trades: 0, wins: 0, pnl: 0 };
    map[key].trades++;
    if (pnl > 0) map[key].wins++;
    map[key].pnl += pnl;
  }

  return Object.values(map)
    .map((row) => ({
      day: row.day,
      hour: row.hour,
      trades: row.trades,
      winRate: row.trades > 0 ? round2((row.wins / row.trades) * 100) : 0,
      pnl: round2(row.pnl),
    }))
    .sort((a, b) => a.day - b.day || a.hour - b.hour);
}
