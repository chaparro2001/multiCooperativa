import type { DomainEvent } from '../../../shared/events';

/** A document or a new version was uploaded: its current version must be indexed. */
export type DocumentPublished = DomainEvent<
  'DocumentPublished',
  { cooperativeId: string; documentId: string; versionId: string }
>;

/** Withdrawn: its fragments leave the index (BR-DOC-05). */
export type DocumentWithdrawn = DomainEvent<
  'DocumentWithdrawn',
  { cooperativeId: string; documentId: string }
>;

export type DocumentEvent = DocumentPublished | DocumentWithdrawn;
