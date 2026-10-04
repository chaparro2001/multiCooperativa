import type { DomainEvent } from '../../../shared/events';

/** A document or a new version was uploaded: its current version must be indexed. */
export type DocumentPublished = DomainEvent<
  'DocumentoPublicado',
  { cooperativeId: string; documentId: string; versionId: string }
>;

/** Withdrawn: its fragments leave the index (RN-DOC-05). */
export type DocumentWithdrawn = DomainEvent<
  'DocumentoRetirado',
  { cooperativeId: string; documentId: string }
>;

export type DocumentEvent = DocumentPublished | DocumentWithdrawn;
