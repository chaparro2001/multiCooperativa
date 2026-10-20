export type SourceKind =
  'document' | 'invoice' | 'delivery_note' | 'third_party' | 'assembly' | 'announcement';

/** A record a tool returned that the answer may be based on. */
export interface Source {
  readonly kind: SourceKind;
  /** Id of the document, invoice, assembly... that the app opens. */
  readonly resourceId: string;
  readonly title: string;
  /** Documents only: where the cited fragment is. */
  readonly page: number | null;
  readonly versionId: string | null;
  readonly excerpt: string | null;
}

export interface Citation extends Source {
  /** Marker the model wrote in the answer, e.g. `S1`. */
  readonly ref: string;
}

/** `[S1]` or `[S1, S2]`, optionally preceded by the space that separates it from the word. */
const MARKER = /\s?\[(S\d+(?:\s*,\s*S\d+)*)\]/g;

/**
 * BR-AI-05: the citations of an answer are the sources it marks, in order of
 * appearance. A marker the tools never returned is dropped (it would be an
 * invented source) and the markers are removed from the text shown to the user.
 */
export function extractCitations(
  answer: string,
  sources: ReadonlyMap<string, Source>,
): { text: string; citations: Citation[] } {
  const seen = new Set<string>();
  const citations: Citation[] = [];
  const text = answer
    .replace(MARKER, (_match, refs: string) => {
      for (const ref of refs.split(',').map((candidate) => candidate.trim())) {
        const source = sources.get(ref);
        if (source && !seen.has(ref)) {
          seen.add(ref);
          citations.push({ ref, ...source });
        }
      }
      return '';
    })
    // A marker before the full stop leaves "word ." behind.
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
  return { text, citations };
}
