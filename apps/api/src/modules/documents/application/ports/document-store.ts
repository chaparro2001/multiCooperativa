import type { PageRequest } from '../../../../shared/pagination';
import type { DocumentCategory, DocumentState, IndexingStatus } from '../../domain/document';

export interface DocumentRecord extends DocumentState {
  id: string;
  cooperativeId: string;
  createdAt: Date;
}

export interface VersionRecord {
  id: string;
  fileKey: string;
  fileName: string;
  size: number;
  isCurrent: boolean;
  indexingStatus: IndexingStatus;
  indexingError: string | null;
  uploadedByMembershipId: string;
  uploadedAt: Date;
}

/** BR-DOC-03: every document has exactly one current version. */
export interface DocumentWithCurrent extends DocumentRecord {
  current: VersionRecord;
}

export interface NewVersion {
  fileKey: string;
  fileName: string;
  size: number;
  uploadedByMembershipId: string;
}

/** Every method is scoped to one cooperative (ADR-003). */
export interface DocumentStore {
  /**
   * Newest document date first, then title, then id (US-DOC-02); `search` matches the title,
   * case-insensitive. A keyset page: the cursor is [documentDate, title, id] of the last row
   * seen and `page.limit` rows are returned at most.
   */
  list(
    cooperativeId: string,
    query: { onlyPublished: boolean; category?: DocumentCategory; search?: string },
    page: PageRequest,
  ): Promise<DocumentWithCurrent[]>;
  find(cooperativeId: string, id: string): Promise<DocumentWithCurrent | null>;
  create(
    cooperativeId: string,
    data: { state: DocumentState; version: NewVersion },
  ): Promise<DocumentWithCurrent>;
  /**
   * Locked: `check` may refuse; the new version becomes current and the previous
   * one stays in the history. Null if the document does not exist here.
   */
  addVersion(
    cooperativeId: string,
    id: string,
    check: (document: DocumentRecord) => void,
    version: NewVersion,
  ): Promise<DocumentWithCurrent | null>;
  update(
    cooperativeId: string,
    id: string,
    decide: (current: DocumentRecord) => DocumentState,
  ): Promise<DocumentRecord | null>;
  /** Newest first. Null if the document does not exist here. */
  listVersions(cooperativeId: string, id: string): Promise<VersionRecord[] | null>;
}
