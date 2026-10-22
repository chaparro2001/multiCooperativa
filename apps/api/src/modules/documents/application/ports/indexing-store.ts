import type { DocumentCategory, IndexingStatus } from '../../domain/document';

export interface VersionToIndex {
  fileKey: string;
  /** Only the current version of a published document is indexed (BR-DOC-04). */
  indexable: boolean;
  /** Of the document: they go into the contextual header of every fragment (ADR-023). */
  title: string;
  category: DocumentCategory;
}

export interface PendingVersion {
  cooperativeId: string;
  documentId: string;
  versionId: string;
}

/** Bookkeeping of the indexing state of each version (US-DOC-06). */
export interface IndexingStore {
  findVersion(
    cooperativeId: string,
    documentId: string,
    versionId: string,
  ): Promise<VersionToIndex | null>;
  setStatus(versionId: string, status: IndexingStatus, error: string | null): Promise<void>;
  /**
   * Platform-wide on purpose: at startup the indexer resumes what a restart
   * interrupted, in every cooperative. Only current versions of published documents.
   */
  listPending(): Promise<PendingVersion[]>;
}
