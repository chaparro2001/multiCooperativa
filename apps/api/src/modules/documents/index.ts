import type { RequestHandler } from 'express';

import type { EventPublisher, EventSubscriber } from '../../shared/events';
import type { FileStorage } from '../../shared/files/file-storage';
import type { PrismaClient } from '../../shared/infrastructure/prisma';
import type { CooperativeContext } from '../access';
import { searchDocuments } from './application/documents';
import type { DocumentEvent } from './application/events';
import { createIndexer } from './application/indexing';
import type { Embedder } from './application/ports/embedder';
import type { MemberDirectory } from './application/ports/member-directory';
import type { PdfTextExtractor } from './application/ports/text-extractor';
import { createDocumentsRouter } from './infrastructure/http/documents-router';
import { documentErrorHandler } from './infrastructure/http/error-handler';
import { PgVectorFragmentIndex } from './infrastructure/pgvector-fragment-index';
import { PrismaDocumentStore } from './infrastructure/prisma-document-store';
import { PrismaIndexingStore } from './infrastructure/prisma-indexing-store';
import { UnpdfTextExtractor } from './infrastructure/unpdf-text-extractor';

export type { DocumentEvent, DocumentPublished, DocumentWithdrawn } from './application/events';
export type { Embedder, EmbeddingKind } from './application/ports/embedder';
export type { FragmentHit } from './application/ports/fragment-index';
export { EMBEDDING_DIMENSIONS } from './application/ports/embedder';
export { GeminiEmbedder, type GeminiEmbeddingClient } from './infrastructure/gemini-embedder';
export { OllamaEmbedder } from './infrastructure/ollama-embedder';
/** Deterministic embedder for tests and CI, where there is no Ollama (ADR-006). */
export { HashingEmbedder } from './application/testing/hashing-embedder';

/** Public interface of the documents module (requirements/03), including RAG indexing. */
export function createDocumentsModule(deps: {
  prisma: PrismaClient;
  files: FileStorage;
  /** Publishes its events and listens to them to index (DocumentPublished, DocumentWithdrawn). */
  events: EventPublisher<DocumentEvent> & EventSubscriber<DocumentEvent>;
  members: MemberDirectory;
  requireCooperative: RequestHandler;
  embedder: Embedder;
  extractor?: PdfTextExtractor;
  now?: () => Date;
}) {
  const index = new PgVectorFragmentIndex(deps.prisma);
  const indexingStore = new PrismaIndexingStore(deps.prisma);
  const indexer = createIndexer({
    store: indexingStore,
    index,
    files: deps.files,
    extractor: deps.extractor ?? new UnpdfTextExtractor(),
    embedder: deps.embedder,
    onError: (error, job) =>
      console.error(
        `Failed to index version ${job.versionId}:`,
        error instanceof Error ? error.message : error,
      ),
  });

  deps.events.subscribe('DocumentPublished', (event) => indexer.enqueue(event.payload));
  deps.events.subscribe('DocumentWithdrawn', (event) =>
    indexer.remove(event.payload.cooperativeId, event.payload.documentId),
  );

  const useCaseDeps = {
    documents: new PrismaDocumentStore(deps.prisma),
    members: deps.members,
    files: deps.files,
    events: deps.events,
    now: deps.now ?? (() => new Date()),
    indexingStore,
    indexer,
    embedder: deps.embedder,
    index,
  };
  return {
    router: createDocumentsRouter(useCaseDeps, deps.requireCooperative),
    errorHandler: documentErrorHandler,
    /** Background indexing: resume what a restart interrupted; wait for it in tests. */
    indexing: { resumePending: indexer.resumePending, idle: indexer.idle },
    /** For the assistant's RAG (requirements/07), with the caller's permissions. */
    search: (context: CooperativeContext, query: string) =>
      searchDocuments({ embedder: deps.embedder, index }, context, query),
  };
}
