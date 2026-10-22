import type { DocumentCategory } from './document';

const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  bylaws: 'Estatutos',
  regulations: 'Reglamento',
  minutes: 'Acta',
  accounts: 'Cuentas',
  other: 'Otros',
};

export type HeaderPart = 'title' | 'category' | 'section';

/**
 * What the header of an indexed fragment carries. Measured with the retrieval benchmark
 * (ADR-023): the document title helps (it is the only part that raised the text arm and left the
 * vector arm intact); adding the category or the section path lowered hit@1 and MRR, so they are
 * stored (`section`) and available to `contextHeader`, but not indexed.
 */
export const INDEXED_HEADER_PARTS: readonly HeaderPart[] = ['title'];

/**
 * Contextual header of a fragment (ADR-023): "<document title> · <category> · <section>", the
 * parts asked for and available. It is indexed (embedded and full-text) together with the
 * fragment, so a fragment that only says "the quorum is half plus one" still carries which
 * document it is from. The fragment's own `content`, the text shown and cited, never includes it.
 */
export function contextHeader(
  input: { title: string; category: DocumentCategory; section: string | null },
  parts: readonly HeaderPart[] = ['title', 'category', 'section'],
): string {
  return [
    parts.includes('title') ? input.title.trim() : '',
    parts.includes('category') ? CATEGORY_LABEL[input.category] : '',
    parts.includes('section') ? (input.section?.trim() ?? '') : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What is embedded for a fragment: its header, a line break and its own text. */
export function embeddedText(header: string, content: string): string {
  return header ? `${header}\n${content}` : content;
}
