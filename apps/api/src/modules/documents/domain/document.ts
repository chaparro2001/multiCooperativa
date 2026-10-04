import {
  DocumentFileRejectedError,
  InvalidDocumentError,
  InvalidDocumentTransitionError,
} from './errors';

export const TITLE_MAX_LENGTH = 150;
/** RN-DOC-02. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const DOCUMENT_CATEGORIES = [
  'estatutos',
  'reglamento',
  'actas',
  'cuentas',
  'otros',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Uploading publishes: there are no drafts (HU-DOC-01). Withdrawing is final. */
export type DocumentStatus = 'publicado' | 'retirado';

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
  if (title.length === 0) throw new InvalidDocumentError('Falta el título del documento.');
  if (title.length > TITLE_MAX_LENGTH) {
    throw new InvalidDocumentError(`El título supera los ${TITLE_MAX_LENGTH} caracteres.`);
  }
  if (!DOCUMENT_CATEGORIES.includes(input.category)) {
    throw new InvalidDocumentError('La categoría no es válida.');
  }
  if (!isCalendarDate(input.documentDate)) {
    throw new InvalidDocumentError('La fecha del documento no es válida.');
  }
  return { status: 'publicado', title, category: input.category, documentDate: input.documentDate };
}

/** RN-DOC-02, on the facts the server measured, never on what the client declared. */
export function assertValidFile(file: { isPdf: boolean; size: number }): void {
  if (file.size === 0) throw new DocumentFileRejectedError('empty');
  if (!file.isPdf) throw new DocumentFileRejectedError('not_pdf');
  if (file.size > MAX_FILE_BYTES) throw new DocumentFileRejectedError('too_large');
}

/** HU-DOC-04. */
export function assertCanAddVersion(document: DocumentState): void {
  if (document.status !== 'publicado') {
    throw new InvalidDocumentTransitionError('Un documento retirado no admite versiones nuevas.');
  }
}

/** HU-DOC-05. */
export function withdraw<T extends DocumentState>(document: T): T {
  if (document.status !== 'publicado') {
    throw new InvalidDocumentTransitionError('El documento ya está retirado.');
  }
  return { ...document, status: 'retirado' };
}

/** HU-DOC-03: withdrawn documents only exist for «gestión». */
export function isVisible(status: DocumentStatus, canManage: boolean): boolean {
  return canManage || status === 'publicado';
}

/** HU-DOC-06: whether the assistant already knows this version. */
export const INDEXING_STATUSES = ['pendiente', 'indexado', 'error', 'no_indexable'] as const;
export type IndexingStatus = (typeof INDEXING_STATUSES)[number];
