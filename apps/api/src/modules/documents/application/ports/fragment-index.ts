import type { DocumentCategory } from '../../domain/document';

export interface IndexedFragment {
  page: number;
  position: number;
  content: string;
  embedding: number[];
}

export interface FragmentHit {
  documentId: string;
  /** Version the fragment was extracted from, so a citation can name it (BR-AI-05). */
  versionId: string;
  title: string;
  category: DocumentCategory;
  page: number;
  content: string;
  /** Cosine similarity, 1 = identical. */
  score: number;
}

/** What a search looks for: the text (exact terms) and its embedding (meaning). */
export interface SearchQuery {
  text: string;
  embedding: number[];
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
  /**
   * Hybrid search: a vector arm (cosine similarity, above a minimum) and a text arm (any of the
   * query terms), fused with Reciprocal Rank Fusion. `score` is the cosine similarity of every hit.
   * NFR-DOC-03: both arms filter by cooperative (and published documents) before ranking,
   * so another cooperative's text can never come back.
   */
  search(cooperativeId: string, query: SearchQuery, limit: number): Promise<FragmentHit[]>;
}
