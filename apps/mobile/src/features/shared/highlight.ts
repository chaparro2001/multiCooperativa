export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Splits `text` around the (case-insensitive) occurrences of each word of `query` so the caller
 * can set the matches in bold. Words shorter than 2 characters are ignored. Pure.
 */
export function splitHighlight(text: string, query: string): HighlightPart[] {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0 || text === '') return [{ text, match: false }];
  const pattern = new RegExp(`(${words.join('|')})`, 'gi');
  const parts: HighlightPart[] = [];
  let last = 0;
  for (const found of text.matchAll(pattern)) {
    const start = found.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), match: false });
    parts.push({ text: found[0], match: true });
    last = start + found[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts.length > 0 ? parts : [{ text, match: false }];
}
