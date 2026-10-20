import {
  type DocumentDetail,
  type DocumentSummary,
  listDocumentsQuerySchema,
  type ListDocumentsResponse,
  type ListDocumentVersionsResponse,
  searchDocumentsQuerySchema,
  type SearchDocumentsResponse,
  uploadDocumentFieldsSchema,
} from '@multicooperativa/contracts';
import { type Request, type RequestHandler, Router } from 'express';
import multer from 'multer';

import {
  type CooperativeContext,
  getCooperativeContext,
  hasAccess,
  requirePermission,
} from '../../../access';
import { InvalidRequestError, parseBody } from '../../../../shared/infrastructure/http/validation';
import * as useCases from '../../application/documents';
import type { DocumentDeps, IndexingDeps, UploadedFile } from '../../application/documents';
import type { Embedder } from '../../application/ports/embedder';
import type { FragmentIndex } from '../../application/ports/fragment-index';
import type { DocumentWithCurrent } from '../../application/ports/document-store';
import { MAX_FILE_BYTES } from '../../domain/document';

/** Busboy reads multipart file names as latin1; the app sends UTF-8. */
function uploadedFile(req: Request): UploadedFile {
  if (!req.file) throw new InvalidRequestError();
  const decoded = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  const name = decoded.split(/[\\/]/).pop()?.trim().slice(0, 200) || 'document.pdf';
  return { name, content: new Uint8Array(req.file.buffer) };
}

/** The indexing state is a “manage” concern (US-DOC-06). */
function toSummary(document: DocumentWithCurrent, context: CooperativeContext): DocumentSummary {
  const manager = hasAccess(context.permissions, 'documents', 'manage');
  return {
    id: document.id,
    title: document.title,
    category: document.category,
    documentDate: document.documentDate,
    status: document.status,
    size: document.current.size,
    indexingStatus: manager ? document.current.indexingStatus : null,
  };
}

/** HTTP adapter of the documents module (requirements/03, section 8). */
export function createDocumentsRouter(
  deps: DocumentDeps & IndexingDeps & { embedder: Embedder; index: FragmentIndex },
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperatives/:cooperativeId/documents';
  const read = [requireCooperative, requirePermission('documents', 'read')];
  const manage = [requireCooperative, requirePermission('documents', 'manage')];
  // In memory with a hard limit at 20 MB (BR-DOC-02).
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 3 },
  }).single('file');

  router.get(base, ...read, async (req, res) => {
    const query = listDocumentsQuerySchema.safeParse(req.query);
    if (!query.success) throw new InvalidRequestError();
    const context = getCooperativeContext(res);
    const documents = await useCases.listDocuments(deps, context, {
      category: query.data.category,
      search: query.data.q,
    });
    res.json({
      items: documents.map((document) => toSummary(document, context)),
    } satisfies ListDocumentsResponse);
  });

  // Before `/:documentId`, which would otherwise take “search” as an id.
  router.get(`${base}/search`, ...read, async (req, res) => {
    const query = searchDocumentsQuerySchema.safeParse(req.query);
    if (!query.success) throw new InvalidRequestError();
    const hits = await useCases.searchDocuments(deps, getCooperativeContext(res), query.data.q);
    res.json({
      items: hits.map((hit) => ({
        documentId: hit.documentId,
        title: hit.title,
        category: hit.category,
        page: hit.page,
        excerpt: hit.content,
        score: Math.round(hit.score * 1000) / 1000,
      })),
    } satisfies SearchDocumentsResponse);
  });

  router.get(`${base}/:documentId`, ...read, async (req, res) => {
    const context = getCooperativeContext(res);
    const detail = await useCases.getDocument(deps, context, String(req.params.documentId));
    const summary = toSummary(detail, context);
    res.json({
      ...summary,
      fileName: detail.current.fileName,
      updatedAt: detail.current.uploadedAt.toISOString(),
      url: detail.url,
      indexingError: summary.indexingStatus ? detail.current.indexingError : null,
    } satisfies DocumentDetail);
  });

  // multipart/form-data: “title”, “category”, “documentDate” and the PDF in “file”.
  router.post(base, ...manage, upload, async (req, res) => {
    const fields = parseBody(uploadDocumentFieldsSchema, req.body);
    const context = getCooperativeContext(res);
    const document = await useCases.uploadDocument(deps, context, fields, uploadedFile(req));
    res.status(201).json(toSummary(document, context));
  });

  router.post(`${base}/:documentId/versions`, ...manage, upload, async (req, res) => {
    const context = getCooperativeContext(res);
    const document = await useCases.addVersion(
      deps,
      context,
      String(req.params.documentId),
      uploadedFile(req),
    );
    res.status(201).json(toSummary(document, context));
  });

  router.get(`${base}/:documentId/versions`, ...manage, async (req, res) => {
    const versions = await useCases.listVersions(
      deps,
      getCooperativeContext(res),
      String(req.params.documentId),
    );
    res.json({
      versions: versions.map((version) => ({
        id: version.id,
        fileName: version.fileName,
        size: version.size,
        isCurrent: version.isCurrent,
        indexingStatus: version.indexingStatus,
        uploadedAt: version.uploadedAt.toISOString(),
        uploadedByName: version.uploadedByName,
      })),
    } satisfies ListDocumentVersionsResponse);
  });

  router.post(`${base}/:documentId/withdraw`, ...manage, async (req, res) => {
    await useCases.withdrawDocument(
      deps,
      getCooperativeContext(res),
      String(req.params.documentId),
    );
    res.status(204).end();
  });

  // US-DOC-06: answers at once; the indexing runs in the background.
  router.post(`${base}/:documentId/reindex`, ...manage, async (req, res) => {
    await useCases.reindexDocument(deps, getCooperativeContext(res), String(req.params.documentId));
    res.status(202).end();
  });

  return router;
}
