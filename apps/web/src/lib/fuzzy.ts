export function fuzzyMatch(query: string, value: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  let index = 0;
  const target = value.toLowerCase();
  for (const char of target) {
    if (char === q[index]) index++;
    if (index === q.length) return true;
  }
  return false;
}
