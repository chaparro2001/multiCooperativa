import type { DocumentCategory } from '../../domain/document';

export interface IndexedFragment {
  page: number;
  position: number;
  /** The fragment's own text: what is shown and cited. */
  content: string;
  /** Heading path of the fragment (ADR-023); null when there is none. */
  section: string | null;
  /** "<title> · <category> · <section>": indexed with the content, never shown. */
  contextHeader: string;
  /** Embedding of the header plus the content. */
  embedding: number[];
}

export interface FragmentHit {
  documentId: string;
  /** Version the fragment was extracted from, so a citation can name it (BR-AI-05). */
  versionId: string;
  title: string;
  category: DocumentCategory;
  page: number;
  /** Position of the fragment in its document, to find its neighbours. */
  position: number;
  /** The fragment's own text: what is cited. */
  content: string;
  /** The fragment plus adjacent text, for the model (ADR-023); only searches for the assistant fill it. */
  context?: string;
  /** Cosine similarity, 1 = identical. */
  score: number;
}

/** What a search looks for: the text (exact terms) and its embedding (meaning). */
export interface SearchQuery {
  text: string;
  embedding: number[];
  /**
   * Benchmark only (NFR-DOC-05): restricts the search to one arm to measure it alone. Never set
   * by the API or the assistant; default `hybrid`.
   */
  arm?: 'hybrid' | 'vector' | 'text';
}

/** An adjacent fragment of the same document. */
export interface NeighbourFragment {
  documentId: string;
  position: number;
  page: number;
  content: string;
}

/** The pgvector index of document fragments. Every method is scoped to one cooperative (ADR-003). */
export interface FragmentIndex {
  /** BR-DOC-05: the fragments of any previous version are removed in the same step. */
  replaceDocument(
    cooperativeId: string,
    documentId: string,
    versionId: string,
    fragments: IndexedFragment[],
  ): Promise<void>;
  deleteDocument(cooperativeId: string, documentId: string): Promise<void>;
  /** The fragments right before and after each given one (same document, position ±1). */
  neighbours(
    cooperativeId: string,
    of: { documentId: string; position: number }[],
  ): Promise<NeighbourFragment[]>;
  /**
   * Hybrid search: a vector arm (cosine similarity, above a minimum) and a text arm (any of the
   * query terms), fused with Reciprocal Rank Fusion. `score` is the cosine similarity of every hit.
   * NFR-DOC-03: both arms filter by cooperative (and published documents) before ranking,
   * so another cooperative's text can never come back.
   */
  search(cooperativeId: string, query: SearchQuery, limit: number): Promise<FragmentHit[]>;
}
