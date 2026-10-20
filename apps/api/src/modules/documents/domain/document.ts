import {
  DocumentFileRejectedError,
  InvalidDocumentError,
  InvalidDocumentTransitionError,
} from './errors';

export const TITLE_MAX_LENGTH = 150;
/** BR-DOC-02. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_CATEGORIES = [
  'bylaws',
  'regulations',
  'minutes',
  'accounts',
  'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Uploading publishes: there are no drafts (US-DOC-01). Withdrawing is final. */
export type DocumentStatus = 'published' | 'withdrawn';

export interface DocumentState {
  readonly status: DocumentStatus;
  readonly title: string;
  readonly category: DocumentCategory;
  /** Calendar date of the document itself (e.g. the meeting of some minutes), YYYY-MM-DD. */
  readonly documentDate: string;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function createDocument(input: {
  title: string;
  category: DocumentCategory;
  documentDate: string;
}): DocumentState {
  const title = input.title.trim();
  if (title.length === 0) throw new InvalidDocumentError('The document title is missing.');
  if (title.length > TITLE_MAX_LENGTH) {
    throw new InvalidDocumentError(`The title exceeds ${TITLE_MAX_LENGTH} characters.`);
  }
  if (!DOCUMENT_CATEGORIES.includes(input.category)) {
    throw new InvalidDocumentError('The category is not valid.');
  }
  if (!isCalendarDate(input.documentDate)) {
    throw new InvalidDocumentError('The document date is not valid.');
  }
  return { status: 'published', title, category: input.category, documentDate: input.documentDate };
}

/** BR-DOC-02, on the facts the server measured, never on what the client declared. */
export function assertValidFile(file: { isPdf: boolean; size: number }): void {
  if (file.size === 0) throw new DocumentFileRejectedError('empty');
  if (!file.isPdf) throw new DocumentFileRejectedError('not_pdf');
  if (file.size > MAX_FILE_BYTES) throw new DocumentFileRejectedError('too_large');
}

/** US-DOC-04. */
export function assertCanAddVersion(document: DocumentState): void {
  if (document.status !== 'published') {
    throw new InvalidDocumentTransitionError('A withdrawn document does not accept new versions.');
  }
}

/** US-DOC-05. */
export function withdraw<T extends DocumentState>(document: T): T {
  if (document.status !== 'published') {
    throw new InvalidDocumentTransitionError('The document is already withdrawn.');
  }
  return { ...document, status: 'withdrawn' };
}

/** US-DOC-03: withdrawn documents only exist for “manage”. */
export function isVisible(status: DocumentStatus, canManage: boolean): boolean {
  return canManage || status === 'published';
}

/** US-DOC-06: whether the assistant already knows this version. */
export const INDEXING_STATUSES = ['pending', 'indexed', 'error', 'not_indexable'] as const;
export type IndexingStatus = (typeof INDEXING_STATUSES)[number];
