import { type CooperativeContext, hasAccess, requireAccess } from '../../access';
import type { EventPublisher } from '../../../shared/events';
import { isPdf } from '../../../shared/domain/pdf';
import { type FileStorage, newFileKey } from '../../../shared/files/file-storage';
import {
  assertCanAddVersion,
  assertValidFile,
  createDocument,
  type DocumentCategory,
  isVisible,
  withdraw,
} from '../domain/document';
import { DocumentNotFoundError } from './errors';
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
  hasAccess(context.permissions, 'documentos', 'gestion');

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
  const fileKey = newFileKey(context.cooperativeId, 'documentos');
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
    type: 'DocumentoPublicado',
    occurredAt: deps.now(),
    payload: {
      cooperativeId: document.cooperativeId,
      documentId: document.id,
      versionId: document.current.id,
    },
  });
}

/** HU-DOC-02. */
export async function listDocuments(
  deps: DocumentDeps,
  context: CooperativeContext,
  filter: { category?: DocumentCategory; search?: string },
): Promise<DocumentWithCurrent[]> {
  requireAccess(context.permissions, 'documentos', 'consulta');
  return deps.documents.list(context.cooperativeId, {
    onlyPublished: !canManage(context),
    category: filter.category,
    search: filter.search?.trim() || undefined,
  });
}

export interface DocumentDetail extends DocumentWithCurrent {
  /** Signed link to the current version, 5 minutes (RNF-DOC-02). */
  url: string;
}

/** HU-DOC-03. */
export async function getDocument(
  deps: DocumentDeps,
  context: CooperativeContext,
  id: string,
): Promise<DocumentDetail> {
  requireAccess(context.permissions, 'documentos', 'consulta');
  const document = await findVisible(deps, context, id);
  const url = await deps.files.signedDownloadUrl(document.current.fileKey, {
    fileName: document.current.fileName,
    contentType: PDF,
  });
  return { ...document, url };
}

/** HU-DOC-01: published at once and sent to indexing. */
export async function uploadDocument(
  deps: DocumentDeps,
  context: CooperativeContext,
  input: { title: string; category: DocumentCategory; documentDate: string },
  file: UploadedFile,
): Promise<DocumentWithCurrent> {
  requireAccess(context.permissions, 'documentos', 'gestion');
  const state = createDocument(input);
  const document = await storeFile(deps, context, file, (version) =>
    deps.documents.create(context.cooperativeId, { state, version }),
  );
  await announcePublished(deps, document);
  return document;
}

/** HU-DOC-04: the new version becomes current; only it gets indexed. */
export async function addVersion(
  deps: DocumentDeps,
  context: CooperativeContext,
  id: string,
  file: UploadedFile,
): Promise<DocumentWithCurrent> {
  requireAccess(context.permissions, 'documentos', 'gestion');
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

/** HU-DOC-04: the whole history, with date and author. */
export async function listVersions(
  deps: DocumentDeps,
  context: CooperativeContext,
  id: string,
): Promise<VersionEntry[]> {
  requireAccess(context.permissions, 'documentos', 'gestion');
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

/** HU-DOC-05: hidden from «consulta» and removed from the index. */
export async function withdrawDocument(
  deps: DocumentDeps,
  context: CooperativeContext,
  id: string,
): Promise<DocumentRecord> {
  requireAccess(context.permissions, 'documentos', 'gestion');
  const withdrawn = UUID.test(id)
    ? await deps.documents.update(context.cooperativeId, id, (current) => withdraw(current))
    : null;
  if (!withdrawn) throw new DocumentNotFoundError();
  await deps.events.publish({
    type: 'DocumentoRetirado',
    occurredAt: deps.now(),
    payload: { cooperativeId: context.cooperativeId, documentId: withdrawn.id },
  });
  return withdrawn;
}
