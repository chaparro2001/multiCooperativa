import { type CooperativeContext, hasAccess, requireAccess } from '../../access';
import type { EventPublisher } from '../../../shared/events';
import { isPdf } from '../../../shared/domain/pdf';
import { type FileStorage, newFileKey } from '../../../shared/files/file-storage';
import {
  DAY_CURSOR,
  type Page,
  pageRequest,
  TEXT_CURSOR,
  toPage,
  UUID_CURSOR,
} from '../../../shared/pagination';
import {
  assertCanAddVersion,
  assertValidFile,
  createDocument,
  type DocumentCategory,
  isVisible,
  republish,
  withdraw,
} from '../domain/document';
import { InvalidDocumentTransitionError } from '../domain/errors';
import { expandContext } from '../domain/neighbours';
import { DocumentNotFoundError } from './errors';
import type { Indexer } from './indexing';
import type { Embedder } from './ports/embedder';
import type { FragmentHit, FragmentIndex } from './ports/fragment-index';
import type { IndexingStore } from './ports/indexing-store';
import type { DocumentEvent } from './events';
import type {
  DocumentRecord,
  DocumentStore,
  DocumentWithCurrent,
  NewVersion,
  VersionRecord,
} from './ports/document-store';
import type { MemberDirectory } from './ports/member-directory';

const PDF = 'application/pdf';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DocumentDeps {
  documents: DocumentStore;
  members: MemberDirectory;
  files: FileStorage;
  events: EventPublisher<DocumentEvent>;
  now: () => Date;
}

export interface UploadedFile {
  name: string;
  content: Uint8Array;
}

const canManage = (context: CooperativeContext) =>
  hasAccess(context.permissions, 'documents', 'manage');

async function findVisible(
  deps: DocumentDeps,
  context: CooperativeContext,
  id: string,
): Promise<DocumentWithCurrent> {
  const document = UUID.test(id) ? await deps.documents.find(context.cooperativeId, id) : null;
  if (!document || !isVisible(document.status, canManage(context))) {
    throw new DocumentNotFoundError();
  }
  return document;
}

/**
 * Validates the PDF by content, stores it and runs `save`. If saving fails the
 * file is deleted, so storage never keeps files nobody references.
 */
async function storeFile<T>(
  deps: DocumentDeps,
  context: CooperativeContext,
  file: UploadedFile,
  save: (version: NewVersion) => Promise<T>,
): Promise<T> {
  assertValidFile({ isPdf: isPdf(file.content), size: file.content.byteLength });
  const fileKey = newFileKey(context.cooperativeId, 'documents');
  await deps.files.put(fileKey, file.content, PDF);
  try {
    return await save({
      fileKey,
      fileName: file.name,
      size: file.content.byteLength,
      uploadedByMembershipId: context.membershipId,
    });
  } catch (error) {
    await deps.files.delete(fileKey).catch(() => undefined);
    throw error;
  }
}

async function announcePublished(deps: DocumentDeps, document: DocumentWithCurrent) {
  await deps.events.publish({
    type: 'DocumentPublished',
    occurredAt: deps.now(),
    payload: {
      cooperativeId: document.cooperativeId,
      documentId: document.id,
      versionId: document.current.id,
    },
  });
}

const DOCUMENT_CURSOR = [DAY_CURSOR, TEXT_CURSOR, UUID_CURSOR];

/** US-DOC-02: a page of documents; `before` is the previous `nextCursor`. */
export async function listDocuments(
  deps: DocumentDeps,
  context: CooperativeContext,
  filter: { category?: DocumentCategory; search?: string },
  page: { limit: number; before?: string },
): Promise<Page<DocumentWithCurrent>> {
  requireAccess(context.permissions, 'documents', 'read');
  const rows = await deps.documents.list(
    context.cooperativeId,
    {
      onlyPublished: !canManage(context),
      category: filter.category,
      search: filter.search?.trim() || undefined,
    },
    { ...pageRequest(page, DOCUMENT_CURSOR), limit: page.limit + 1 },
  );
  return toPage(rows, page.limit, (document) => [
    document.documentDate,
    document.title,
    document.id,
  ]);
}

export interface DocumentDetail extends DocumentWithCurrent {
  /** Signed link to the current version, 5 minutes (NFR-DOC-02). */
  url: string;
}

/** US-DOC-03. */
export async function getDocument(
  deps: DocumentDeps,
  context: CooperativeContext,
  id: string,
): Promise<DocumentDetail> {
  requireAccess(context.permissions, 'documents', 'read');
  const document = await findVisible(deps, context, id);
  const url = await deps.files.signedDownloadUrl(document.current.fileKey, {
    fileName: document.current.fileName,
    contentType: PDF,
  });
  return { ...document, url };
}

/** US-DOC-01: published at once and sent to indexing. */
export async function uploadDocument(
  deps: DocumentDeps,
  context: CooperativeContext,
  input: { title: string; category: DocumentCategory; documentDate: string },
  file: UploadedFile,
): Promise<DocumentWithCurrent> {
  requireAccess(context.permissions, 'documents', 'manage');
  const state = createDocument(input);
  const document = await storeFile(deps, context, file, (version) =>
    deps.documents.create(context.cooperativeId, { state, version }),
  );
  await announcePublished(deps, document);
  return document;
}

/** US-DOC-04: the new version becomes current; only it gets indexed. */
export async function addVersion(
  deps: DocumentDeps,
  context: CooperativeContext,
  id: string,
  file: UploadedFile,
): Promise<DocumentWithCurrent> {
  requireAccess(context.permissions, 'documents', 'manage');
  // Early: a missing or withdrawn document never gets a file uploaded.
  assertCanAddVersion(await findVisible(deps, context, id));
  const document = await storeFile(deps, context, file, async (version) => {
    const updated = await deps.documents.addVersion(
      context.cooperativeId,
      id,
      assertCanAddVersion,
      version,
    );
    if (!updated) throw new DocumentNotFoundError();
    return updated;
  });
  await announcePublished(deps, document);
  return document;
}

export interface VersionEntry extends VersionRecord {
  uploadedByName: string | null;
}

/** US-DOC-04: the whole history, with date and author. */
export async function listVersions(
  deps: DocumentDeps,
  context: CooperativeContext,
  id: string,
): Promise<VersionEntry[]> {
  requireAccess(context.permissions, 'documents', 'manage');
  const versions = UUID.test(id)
    ? await deps.documents.listVersions(context.cooperativeId, id)
    : null;
  if (!versions) throw new DocumentNotFoundError();
  const names = await deps.members.displayNames(
    context.cooperativeId,
    versions.map((version) => version.uploadedByMembershipId),
  );
  return versions.map((version) => ({
    ...version,
    uploadedByName: names.get(version.uploadedByMembershipId) ?? null,
  }));
}

/** US-DOC-05: hidden from “read” and removed from the index. */
export async function withdrawDocument(
  deps: DocumentDeps,
  context: CooperativeContext,
  id: string,
): Promise<DocumentRecord> {
  requireAccess(context.permissions, 'documents', 'manage');
  const withdrawn = UUID.test(id)
    ? await deps.documents.update(context.cooperativeId, id, (current) => withdraw(current))
    : null;
  if (!withdrawn) throw new DocumentNotFoundError();
  await deps.events.publish({
    type: 'DocumentWithdrawn',
    occurredAt: deps.now(),
    payload: { cooperativeId: context.cooperativeId, documentId: withdrawn.id },
  });
  return withdrawn;
}

/** US-DOC-08: visible again for “read”; its current version is sent to indexing again. */
export async function republishDocument(
  deps: DocumentDeps & Pick<IndexingDeps, 'indexingStore'>,
  context: CooperativeContext,
  id: string,
): Promise<DocumentWithCurrent> {
  requireAccess(context.permissions, 'documents', 'manage');
  const updated = UUID.test(id)
    ? await deps.documents.update(context.cooperativeId, id, (current) => republish(current))
    : null;
  const document = updated ? await deps.documents.find(context.cooperativeId, id) : null;
  if (!document) throw new DocumentNotFoundError();
  // The fragments were deleted on withdrawal: until indexed again it is not “available”.
  await deps.indexingStore.setStatus(document.current.id, 'pending', null);
  await announcePublished(deps, document);
  return document;
}

export interface IndexingDeps {
  indexingStore: IndexingStore;
  indexer: Pick<Indexer, 'enqueue'>;
}

/** US-DOC-06: retry. Answers at once; the indexing runs in the background. */
export async function reindexDocument(
  deps: DocumentDeps & IndexingDeps,
  context: CooperativeContext,
  id: string,
): Promise<void> {
  requireAccess(context.permissions, 'documents', 'manage');
  const document = await findVisible(deps, context, id);
  if (document.status !== 'published') {
    throw new InvalidDocumentTransitionError('A withdrawn document is not indexed.');
  }
  await deps.indexingStore.setStatus(document.current.id, 'pending', null);
  deps.indexer.enqueue({
    cooperativeId: context.cooperativeId,
    documentId: document.id,
    versionId: document.current.id,
  });
}

/** Fragments returned per search: what the assistant gives the model (single source of truth). */
export const SEARCH_RESULTS = 5;

/** US-DOC-07: the most relevant fragments of this cooperative's published documents. */
export async function searchDocuments(
  deps: { embedder: Embedder; index: FragmentIndex },
  context: CooperativeContext,
  query: string,
): Promise<FragmentHit[]> {
  requireAccess(context.permissions, 'documents', 'read');
  return retrieveFragments(deps, context.cooperativeId, query);
}

/** The search itself, with no permission check: the caller has already authorized it. */
export async function retrieveFragments(
  deps: { embedder: Embedder; index: FragmentIndex },
  cooperativeId: string,
  query: string,
  arm?: 'hybrid' | 'vector' | 'text',
): Promise<FragmentHit[]> {
  const text = query.trim();
  const [embedding] = await deps.embedder.embed([text], 'query');
  return deps.index.search(cooperativeId, { text, embedding: embedding!, arm }, SEARCH_RESULTS);
}

/**
 * Search for the assistant (ADR-023): the same fragments, each with `context`, its own text plus
 * the adjacent fragment when it is short or cut mid-sentence (bounded). Citations keep using
 * the fragment's own `content` and page.
 */
export async function searchDocumentsWithContext(
  deps: { embedder: Embedder; index: FragmentIndex },
  context: CooperativeContext,
  query: string,
): Promise<FragmentHit[]> {
  requireAccess(context.permissions, 'documents', 'read');
  return withNeighbourContext(
    deps.index,
    context.cooperativeId,
    await retrieveFragments(deps, context.cooperativeId, query),
  );
}

/** Adds `context` to each hit from the neighbouring fragments of the same document and page. */
export async function withNeighbourContext(
  index: FragmentIndex,
  cooperativeId: string,
  hits: FragmentHit[],
): Promise<FragmentHit[]> {
  const neighbours = await index.neighbours(cooperativeId, hits);
  const at = (hit: FragmentHit, offset: number) =>
    neighbours.find((n) => n.documentId === hit.documentId && n.position === hit.position + offset);
  return hits.map((hit) => ({
    ...hit,
    context: expandContext(hit, { previous: at(hit, -1), next: at(hit, 1) }),
  }));
}
