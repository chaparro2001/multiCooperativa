import { removePageFurniture } from './page-furniture';
import { classifyLine, SectionPath } from './structure';

/** Requisitos/03, section 4: about 800 characters per fragment, with overlap. */
export const CHUNK_TARGET = 800;
export const CHUNK_OVERLAP = 150;

export interface PageText {
  /** 1-based, as shown to the user in the citations. */
  page: number;
  text: string;
}

export interface Chunk {
  /** Position in the whole document, 0-based. */
  index: number;
  page: number;
  content: string;
  /** Heading path and articles, e.g. "TÍTULO IV > CAPÍTULO II > Artículo 25"; null when there is none. */
  section: string | null;
}

/** US-DOC-06: a scanned PDF without a text layer cannot be indexed. */
export function hasExtractableText(pages: readonly PageText[]): boolean {
  return pages.some((page) => page.text.trim().length > 0);
}

/** Splits text longer than `limit`: by sentences, then by words, then by characters. */
function split(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const sentences = text.split(/(?<=[.!?…;:])\s+/);
  if (sentences.length > 1)
    return pack(
      sentences.flatMap((s) => split(s, limit)),
      limit,
      ' ',
    );
  const words = text.split(' ');
  if (words.length > 1)
    return pack(
      words.flatMap((w) => split(w, limit)),
      limit,
      ' ',
    );
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += limit)
    pieces.push(text.slice(start, start + limit));
  return pieces;
}

/** Greedily joins pieces while they fit in `limit`. */
function pack(pieces: string[], limit: number, separator: string): string[] {
  const packed: string[] = [];
  let current = '';
  for (const piece of pieces) {
    const candidate = current ? `${current}${separator}${piece}` : piece;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      if (current) packed.push(current);
      current = piece;
    }
  }
  if (current) packed.push(current);
  return packed;
}

/** The last `size` characters of a chunk, starting at a word boundary when there is one. */
function tail(text: string, size: number): string {
  if (text.length <= size) return text;
  const cut = text.slice(text.length - size);
  const boundary = cut.indexOf(' ');
  return boundary >= 0 && boundary < cut.length - 1 ? cut.slice(boundary + 1) : cut;
}

interface Unit {
  text: string;
  /** Heading path at the start of the unit. */
  path: string;
  article: string | null;
  heading: boolean;
  /** Level of the heading (1 = TÍTULO), 0 for a unit that is not one. */
  level: number;
  /** The unit is the rest of an oversize block: the fragment repeats the previous tail. */
  continuation: boolean;
}

/** Reads one page into units: headings, articles, numbered items and plain blocks. */
function pageUnits(text: string, sections: SectionPath, target: number): Unit[] {
  const units: Unit[] = [];
  let block: string[] = [];
  let blockArticle: string | null = null;
  let blockPath = sections.toString();

  const flush = () => {
    const joined = block.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) {
      split(joined, target).forEach((piece, i) =>
        units.push({
          text: piece,
          path: blockPath,
          article: blockArticle,
          heading: false,
          level: 0,
          continuation: i > 0,
        }),
      );
    }
    block = [];
    blockArticle = null;
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const kind = classifyLine(line);
    if (kind.kind === 'heading') {
      const previous = units[units.length - 1];
      // Consecutive ALL-CAPS lines are one hard-wrapped heading.
      if (
        block.length === 0 &&
        previous?.heading &&
        kind.level === 1 &&
        line === line.toUpperCase() &&
        previous.text === previous.text.toUpperCase() &&
        !/^(t[íi]tulo|libro|parte|disposici)/i.test(line)
      ) {
        previous.text = `${previous.text} ${line}`;
        sections.enter(1, previous.text);
        continue;
      }
      flush();
      sections.enter(kind.level, kind.text);
      units.push({
        text: line,
        path: sections.toString(),
        article: null,
        heading: true,
        level: kind.level,
        continuation: false,
      });
      blockPath = sections.toString();
      continue;
    }
    if (kind.kind === 'article' || kind.kind === 'item') {
      flush();
      blockPath = sections.toString();
      blockArticle = kind.kind === 'article' ? kind.label : null;
    } else if (block.length === 0) {
      blockPath = sections.toString();
    }
    block.push(line);
  }
  flush();
  // A heading with nothing after it on its page says nothing; the path still carries on.
  while (units.length > 1 && units[units.length - 1]!.heading) units.pop();
  return units;
}

/** "Artículo 25" or "Artículo 25-27" for the articles that start in a fragment. */
function sectionOf(units: Unit[]): string | null {
  const articles = units.map((u) => u.article).filter((a): a is string => a !== null);
  const first = articles[0];
  const last = articles[articles.length - 1];
  const article =
    first && last && first !== last ? `${first}-${last.replace(/^Artículo /, '')}` : first;
  // The path once its headings have been read: that of the first unit that is not a heading.
  const path = (units.find((u) => !u.heading) ?? units[units.length - 1]!).path;
  return [path, article].filter(Boolean).join(' > ') || null;
}

/**
 * Deterministic structure-aware chunking for the RAG (ADR-023). Fragments never span two pages,
 * so each one carries the page it cites (BR-DOC-06). Page furniture is removed first; headings
 * (TÍTULO, CAPÍTULO, Sección, ALL-CAPS), "Artículo N" and numbered items start units that are
 * kept whole when they fit in `target`; a heading stays with what follows. Only a unit larger
 * than `target` is split (sentences, words, characters), and then the fragments overlap. The
 * heading path of each fragment is its `section`.
 */
export function chunkPages(
  pages: readonly PageText[],
  options: { target?: number; overlap?: number } = {},
): Chunk[] {
  const target = options.target ?? CHUNK_TARGET;
  const overlap = options.overlap ?? CHUNK_OVERLAP;
  const chunks: Chunk[] = [];
  const sections = new SectionPath();

  for (const { page, text } of removePageFurniture(pages)) {
    const groups: Unit[][] = [];
    let current: Unit[] = [];
    const size = (units: Unit[]) => units.map((u) => u.text).join('\n\n').length;
    for (const unit of pageUnits(text, sections, target)) {
      // A TÍTULO or CAPÍTULO starts a new fragment, so a fragment stays inside one chapter.
      const opensChapter = unit.heading && unit.level <= 2 && current.some((u) => !u.heading);
      if (
        current.length > 0 &&
        !current.every((u) => u.heading) &&
        (opensChapter || size([...current, unit]) > target)
      ) {
        groups.push(current);
        // A heading is never left at the end of a fragment: it moves on with what it announces.
        const dangling: Unit[] = [];
        while (current.length > 1 && current[current.length - 1]!.heading)
          dangling.unshift(current.pop()!);
        if (dangling.length > 0) groups[groups.length - 1] = current;
        current = dangling;
      }
      current.push(unit);
    }
    if (current.length > 0) groups.push(current);

    let previousBody = '';
    for (const units of groups) {
      const body = units.map((u) => u.text).join('\n\n');
      const content =
        units[0]!.continuation && previousBody
          ? `${tail(previousBody, overlap - 1)} ${body}`
          : body;
      chunks.push({ index: chunks.length, page, content, section: sectionOf(units) });
      previousBody = body;
    }
  }
  return chunks;
}
