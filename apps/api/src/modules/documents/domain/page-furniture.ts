import type { PageText } from './chunking';
import { isPageNumber } from './structure';

/** Lines at the top or bottom of a page that can be a running header or footer. */
const EDGE_LINES = 2;
const MAX_FURNITURE_LENGTH = 120;

const lines = (text: string) => text.replace(/\r\n?/g, '\n').split('\n');

/**
 * The same line with its page number masked: "Página 3 de 10", a trailing or leading number.
 * Numbers elsewhere stay ("Irrigation turn 7." is not furniture just because every page has one).
 */
const signature = (line: string) =>
  line
    .trim()
    .toLowerCase()
    .replace(/(p[áa]g(?:ina|\.)?\s*)\d+(?:\s*(?:de|\/)\s*\d+)?/g, '$1#')
    .replace(/(^|\s)\d{1,4}$/, '$1#')
    .replace(/^\d{1,4}(?=\s)/, '#');

/**
 * Removes page furniture before chunking, so it neither pollutes the fragments nor the search:
 * lines that are only a page number, and short lines at the top or bottom edge of the page that
 * repeat (numbers aside) on at least half of the pages of a document of two pages or more.
 */
export function removePageFurniture(pages: readonly PageText[]): PageText[] {
  const withoutNumbers = pages.map((page) => ({
    ...page,
    lines: lines(page.text).filter((line) => !isPageNumber(line)),
  }));

  const pagesWith = new Map<string, number>();
  if (pages.length >= 2) {
    for (const { lines: pageLines } of withoutNumbers) {
      const edges = new Set(
        [
          ...pageLines.filter((l) => l.trim()).slice(0, EDGE_LINES),
          ...pageLines.filter((l) => l.trim()).slice(-EDGE_LINES),
        ]
          .filter((line) => line.trim().length <= MAX_FURNITURE_LENGTH)
          .map(signature),
      );
      edges.forEach((edge) => pagesWith.set(edge, (pagesWith.get(edge) ?? 0) + 1));
    }
  }
  const threshold = Math.max(2, Math.ceil(pages.length / 2));

  return withoutNumbers.map(({ lines: pageLines, ...page }) => {
    const nonBlank = pageLines.filter((l) => l.trim());
    const edge = new Set([...nonBlank.slice(0, EDGE_LINES), ...nonBlank.slice(-EDGE_LINES)]);
    return {
      ...page,
      text: pageLines
        .filter((line) => !(edge.has(line) && (pagesWith.get(signature(line)) ?? 0) >= threshold))
        .join('\n'),
    };
  });
}
