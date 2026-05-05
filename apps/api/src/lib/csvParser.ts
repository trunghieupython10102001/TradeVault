export interface CsvRow {
  [key: string]: string;
  // positional values stored as _col_0, _col_1, etc.
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]!).map(h => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const row: CsvRow = {};

    // Track how many times each header has appeared to handle duplicates
    const seen: Record<string, number> = {};
    headers.forEach((h, idx) => {
      const count = seen[h] ?? 0;
      // First occurrence uses the plain header name; subsequent ones get _2, _3, etc.
      const key = count === 0 ? h : `${h}_${count + 1}`;
      row[key] = (values[idx] ?? '').trim();
      seen[h] = count + 1;
      // Also store by positional key for reliable access
      row[`_col_${idx}`] = (values[idx] ?? '').trim();
    });

    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
