import type { RequestHandler } from 'express';

import type { EventPublisher } from '../../shared/events';
import type { FileStorage } from '../../shared/files/file-storage';
import type { PrismaClient } from '../../shared/infrastructure/prisma';
import type { DocumentEvent } from './application/events';
import type { MemberDirectory } from './application/ports/member-directory';
import { createDocumentsRouter } from './infrastructure/http/documents-router';
import { documentErrorHandler } from './infrastructure/http/error-handler';
import { PrismaDocumentStore } from './infrastructure/prisma-document-store';

export type { DocumentEvent, DocumentPublished, DocumentWithdrawn } from './application/events';

/** Public interface of the documents module (requisitos/03). */
export function createDocumentsModule(deps: {
  prisma: PrismaClient;
  files: FileStorage;
  events: EventPublisher<DocumentEvent>;
  members: MemberDirectory;
  requireCooperative: RequestHandler;
  now?: () => Date;
}) {
  const useCaseDeps = {
    documents: new PrismaDocumentStore(deps.prisma),
    members: deps.members,
    files: deps.files,
    events: deps.events,
    now: deps.now ?? (() => new Date()),
  };
  return {
    router: createDocumentsRouter(useCaseDeps, deps.requireCooperative),
    errorHandler: documentErrorHandler,
  };
}
