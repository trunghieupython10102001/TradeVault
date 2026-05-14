import { describe, it, expect } from 'vitest';
import { parseCsv } from './csvParser';

describe('parseCsv', () => {
  describe('basic parsing', () => {
    it('returns empty array for header-only input', () => {
      const { rows } = parseCsv('symbol,side,price');
      expect(rows).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      const { rows } = parseCsv('');
      expect(rows).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      const { rows } = parseCsv('   ');
      expect(rows).toEqual([]);
    });

    it('parses a single data row', () => {
      const csv = 'symbol,side,price\nAAPL,LONG,150';
      const { rows } = parseCsv(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.symbol).toBe('AAPL');
      expect(rows[0]!.side).toBe('LONG');
      expect(rows[0]!.price).toBe('150');
    });

    it('parses multiple rows', () => {
      const csv = 'symbol,side\nAAPL,LONG\nTSLA,SHORT\nMSFT,LONG';
      const { rows } = parseCsv(csv);
      expect(rows).toHaveLength(3);
      expect(rows[1]!.symbol).toBe('TSLA');
      expect(rows[2]!.symbol).toBe('MSFT');
    });

    it('trims whitespace from header names', () => {
      const csv = ' symbol , side \nAAPL,LONG';
      const { rows } = parseCsv(csv);
      expect(rows[0]!.symbol).toBe('AAPL');
    });

    it('trims whitespace from cell values', () => {
      const csv = 'symbol,side\n AAPL , LONG ';
      const { rows } = parseCsv(csv);
      expect(rows[0]!.symbol).toBe('AAPL');
      expect(rows[0]!.side).toBe('LONG');
    });

    it('skips empty lines between rows', () => {
      const csv = 'symbol,side\nAAPL,LONG\n\nTSLA,SHORT';
      const { rows } = parseCsv(csv);
      expect(rows).toHaveLength(2);
    });
  });

  describe('quoted fields', () => {
    it('handles quoted values containing commas', () => {
      const csv = 'symbol,notes\nAAPL,"Bought on dip, then held"';
      const { rows } = parseCsv(csv);
      expect(rows[0]!.notes).toBe('Bought on dip, then held');
    });

    it('handles multiple quoted fields in one row', () => {
      const csv = 'a,b,c\n"one,two","three,four","five"';
      const { rows } = parseCsv(csv);
      expect(rows[0]!.a).toBe('one,two');
      expect(rows[0]!.b).toBe('three,four');
      expect(rows[0]!.c).toBe('five');
    });

    it('handles empty quoted field', () => {
      const csv = 'symbol,notes\nAAPL,""';
      const { rows } = parseCsv(csv);
      expect(rows[0]!.notes).toBe('');
    });
  });

  describe('positional keys', () => {
    it('stores values by positional _col_N keys', () => {
      const csv = 'symbol,side,price\nAAPL,LONG,150';
      const { rows } = parseCsv(csv);
      expect(rows[0]!._col_0).toBe('AAPL');
      expect(rows[0]!._col_1).toBe('LONG');
      expect(rows[0]!._col_2).toBe('150');
    });

    it('positional keys available even for duplicate headers', () => {
      const csv = 'price,price\n100,200';
      const { rows } = parseCsv(csv);
      expect(rows[0]!._col_0).toBe('100');
      expect(rows[0]!._col_1).toBe('200');
    });
  });

  describe('duplicate headers', () => {
    it('first occurrence uses plain key, subsequent get _2, _3 suffix', () => {
      const csv = 'price,price,price\n100,200,300';
      const { rows } = parseCsv(csv);
      expect(rows[0]!.price).toBe('100');
      expect(rows[0]!.price_2).toBe('200');
      expect(rows[0]!.price_3).toBe('300');
    });
  });

  describe('missing values', () => {
    it('fills missing trailing columns with empty string', () => {
      const csv = 'a,b,c\n1,2';
      const { rows } = parseCsv(csv);
      expect(rows[0]!.c).toBe('');
    });

    it('handles rows with only commas', () => {
      const csv = 'a,b,c\n,,';
      const { rows } = parseCsv(csv);
      expect(rows[0]!.a).toBe('');
      expect(rows[0]!.b).toBe('');
      expect(rows[0]!.c).toBe('');
    });
  });

  describe('real-world trade CSV shape', () => {
    it('parses a realistic trade export', () => {
      const csv = [
        'Symbol,Side,Entry Price,Exit Price,Quantity,Commission,Entry Date',
        'AAPL,LONG,150.00,160.00,10,2.50,2024-01-15',
        'TSLA,SHORT,250.00,230.00,5,1.00,2024-01-16',
      ].join('\n');

      const { rows } = parseCsv(csv);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.Symbol).toBe('AAPL');
      expect(rows[0]!['Entry Price']).toBe('150.00');
      expect(rows[1]!.Side).toBe('SHORT');
    });
  });
});
