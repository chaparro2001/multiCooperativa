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
   * NFR-DOC-03: filters by cooperative (and published documents) before
   * ranking by similarity, so another cooperative's text can never come back.
   */
  search(cooperativeId: string, embedding: number[], limit: number): Promise<FragmentHit[]>;
}
