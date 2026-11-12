/** Splits a query into lowercase words. */
export function queryWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** True if every word appears somewhere in the title or URL (any order, case-insensitive). */
export function matchesQuery(words: string[], title: string | undefined, url: string): boolean {
  if (words.length === 0) return false;
  const hay = `${title ?? ''} ${url}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
