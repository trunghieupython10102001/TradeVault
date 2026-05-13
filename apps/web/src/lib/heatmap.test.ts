import { describe, expect, it } from 'vitest';
import { getHeatmapColor, getHeatmapOpacity, getWinRateColor } from './heatmap';

describe('heatmap helpers', () => {
  it('scales opacity between a minimum and maximum', () => {
    expect(getHeatmapOpacity(0, 100)).toBe(0.08);
    expect(getHeatmapOpacity(10, 100)).toBe(0.18);
    expect(getHeatmapOpacity(100, 100)).toBe(0.88);
  });

  it('returns pnl colors by sign', () => {
    expect(getHeatmapColor(50, 100)).toContain('34, 197, 94');
    expect(getHeatmapColor(-50, 100)).toContain('248, 113, 113');
    expect(getHeatmapColor(0, 100)).toBe('var(--bg-tertiary)');
  });

  it('returns win-rate colors by quality', () => {
    expect(getWinRateColor(70, 2)).toContain('34, 197, 94');
    expect(getWinRateColor(50, 2)).toContain('251, 191, 36');
    expect(getWinRateColor(30, 2)).toContain('248, 113, 113');
  });
});
