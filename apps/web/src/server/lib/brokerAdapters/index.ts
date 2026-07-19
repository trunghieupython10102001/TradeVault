import type { BrokerAdapter } from './types';
import { mt4mt5Adapter } from './mt4mt5';
import { mt5reportAdapter } from './mt5report';
import { exnessAdapter } from './exness';

export type { BrokerAdapter, NormalizedTrade, ParseResult, Side } from './types';
export { isMt5HistoryReport, extractMt5PositionsCsv } from './mt5report';

export const adapters: BrokerAdapter[] = [exnessAdapter, mt4mt5Adapter, mt5reportAdapter];

export function detectAdapter(headers: string[]): BrokerAdapter | null {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const a of adapters) {
    if (a.detect(lower)) return a;
  }
  return null;
}

export function getAdapter(name: string): BrokerAdapter | null {
  return adapters.find((a) => a.name === name) ?? null;
}
