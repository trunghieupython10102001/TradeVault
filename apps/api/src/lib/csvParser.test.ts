import { describe, it, expect } from 'vitest';
import { parseCsv } from './csvParser';

describe('parseCsv', () => {
  describe('basic parsing', () => {
    it('returns empty array for header-only input', () => {
      expect(parseCsv('symbol,side,price')).toEqual([]);
    });

    it('returns empty array for empty string', () => {
      expect(parseCsv('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(parseCsv('   ')).toEqual([]);
    });

    it('parses a single data row', () => {
      const csv = 'symbol,side,price\nAAPL,LONG,150';
      const result = parseCsv(csv);
      expect(result).toHaveLength(1);
      expect(result[0]!.symbol).toBe('AAPL');
      expect(result[0]!.side).toBe('LONG');
      expect(result[0]!.price).toBe('150');
    });

    it('parses multiple rows', () => {
      const csv = 'symbol,side\nAAPL,LONG\nTSLA,SHORT\nMSFT,LONG';
      const result = parseCsv(csv);
      expect(result).toHaveLength(3);
      expect(result[1]!.symbol).toBe('TSLA');
      expect(result[2]!.symbol).toBe('MSFT');
    });

    it('trims whitespace from header names', () => {
      const csv = ' symbol , side \nAAPL,LONG';
      const result = parseCsv(csv);
      expect(result[0]!.symbol).toBe('AAPL');
    });

    it('trims whitespace from cell values', () => {
      const csv = 'symbol,side\n AAPL , LONG ';
      const result = parseCsv(csv);
      expect(result[0]!.symbol).toBe('AAPL');
      expect(result[0]!.side).toBe('LONG');
    });

    it('skips empty lines between rows', () => {
      const csv = 'symbol,side\nAAPL,LONG\n\nTSLA,SHORT';
      const result = parseCsv(csv);
      expect(result).toHaveLength(2);
    });
  });

  describe('quoted fields', () => {
    it('handles quoted values containing commas', () => {
      const csv = 'symbol,notes\nAAPL,"Bought on dip, then held"';
      const result = parseCsv(csv);
      expect(result[0]!.notes).toBe('Bought on dip, then held');
    });

    it('handles multiple quoted fields in one row', () => {
      const csv = 'a,b,c\n"one,two","three,four","five"';
      const result = parseCsv(csv);
      expect(result[0]!.a).toBe('one,two');
      expect(result[0]!.b).toBe('three,four');
      expect(result[0]!.c).toBe('five');
    });

    it('handles empty quoted field', () => {
      const csv = 'symbol,notes\nAAPL,""';
      const result = parseCsv(csv);
      expect(result[0]!.notes).toBe('');
    });
  });

  describe('positional keys', () => {
    it('stores values by positional _col_N keys', () => {
      const csv = 'symbol,side,price\nAAPL,LONG,150';
      const result = parseCsv(csv);
      expect(result[0]!._col_0).toBe('AAPL');
      expect(result[0]!._col_1).toBe('LONG');
      expect(result[0]!._col_2).toBe('150');
    });

    it('positional keys available even for duplicate headers', () => {
      const csv = 'price,price\n100,200';
      const result = parseCsv(csv);
      expect(result[0]!._col_0).toBe('100');
      expect(result[0]!._col_1).toBe('200');
    });
  });

  describe('duplicate headers', () => {
    it('first occurrence uses plain key, subsequent get _2, _3 suffix', () => {
      const csv = 'price,price,price\n100,200,300';
      const result = parseCsv(csv);
      expect(result[0]!.price).toBe('100');
      expect(result[0]!.price_2).toBe('200');
      expect(result[0]!.price_3).toBe('300');
    });
  });

  describe('missing values', () => {
    it('fills missing trailing columns with empty string', () => {
      const csv = 'a,b,c\n1,2';
      const result = parseCsv(csv);
      expect(result[0]!.c).toBe('');
    });

    it('handles rows with only commas', () => {
      const csv = 'a,b,c\n,,';
      const result = parseCsv(csv);
      expect(result[0]!.a).toBe('');
      expect(result[0]!.b).toBe('');
      expect(result[0]!.c).toBe('');
    });
  });

  describe('real-world trade CSV shape', () => {
    it('parses a realistic trade export', () => {
      const csv = [
        'Symbol,Side,Entry Price,Exit Price,Quantity,Commission,Entry Date',
        'AAPL,LONG,150.00,160.00,10,2.50,2024-01-15',
        'TSLA,SHORT,250.00,230.00,5,1.00,2024-01-16',
      ].join('\n');

      const result = parseCsv(csv);
      expect(result).toHaveLength(2);
      expect(result[0]!.Symbol).toBe('AAPL');
      expect(result[0]!['Entry Price']).toBe('150.00');
      expect(result[1]!.Side).toBe('SHORT');
    });
  });
});
