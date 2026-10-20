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
}

/** US-DOC-06: a scanned PDF without a text layer cannot be indexed. */
export function hasExtractableText(pages: readonly PageText[]): boolean {
  return pages.some((page) => page.text.trim().length > 0);
}

/** Paragraphs are separated by blank lines; inside one, whitespace collapses. */
function paragraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
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

/**
 * Deterministic chunking for the RAG. Fragments never span two pages, so each
 * one carries the page it cites (BR-DOC-06); paragraphs that fit are kept whole.
 */
export function chunkPages(
  pages: readonly PageText[],
  options: { target?: number; overlap?: number } = {},
): Chunk[] {
  const target = options.target ?? CHUNK_TARGET;
  const overlap = options.overlap ?? CHUNK_OVERLAP;
  const chunks: Chunk[] = [];

  for (const { page, text } of pages) {
    const pieces = paragraphs(text).flatMap((paragraph) => split(paragraph, target));
    const bodies = pack(pieces, target, '\n\n');
    bodies.forEach((body, i) => {
      // The separating space counts towards the overlap, so no fragment exceeds target + overlap.
      const content = i === 0 ? body : `${tail(bodies[i - 1]!, overlap - 1)} ${body}`;
      chunks.push({ index: chunks.length, page, content });
    });
  }
  return chunks;
}
