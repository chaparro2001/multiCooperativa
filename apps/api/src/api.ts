import type { Express } from 'express';

import { createApp } from './app';
import { type AuthRateLimits, createAccessModule, type InvitationSender } from './modules/access';
import { type AnnouncementEvent, createAnnouncementsModule } from './modules/announcements';
import { type AssemblyEvent, createAssembliesModule } from './modules/assemblies';
import { createDocumentsModule, type DocumentEvent, type Embedder } from './modules/documents';
import { createInvoicingModule, type InvoicingEvent, runDueDatesJob } from './modules/invoicing';
import { type EventBus, InProcessEventBus } from './shared/events';
import type { FileStorage } from './shared/files/file-storage';
import type { PrismaClient } from './shared/infrastructure/prisma';

/** Every internal event of the app: the union grows with each module that emits. */
export type AppEvent = AnnouncementEvent | DocumentEvent | AssemblyEvent | InvoicingEvent;

export interface ApiDeps {
  prisma: PrismaClient;
  jwtSecret: string;
  invitationSender: InvitationSender;
  files: FileStorage;
  /** Embeddings for document indexing and search (ADR-006). */
  embedder: Embedder;
  /** Injectable so tests can observe the events; one in-process bus by default. */
  events?: EventBus<AppEvent>;
  authRateLimits?: AuthRateLimits | false;
  trustProxy?: number | false;
}

export interface Api {
  app: Express;
  /** Background document indexing: resumed at startup, awaited in tests. */
  indexing: { resumePending(): Promise<number>; idle(): Promise<void> };
  /** Daily due dates of invoices, on this API's event bus (HU-FAC-07). */
  runDueDates(): Promise<{ overdue: number; dueSoon: number }>;
}

/**
 * Wires every module into the HTTP app. The only composition root: `main.ts`
 * runs it and the isolation test walks all the routes it registers.
 */
export function createApi(deps: ApiDeps): Api {
  const events =
    deps.events ??
    new InProcessEventBus<AppEvent>({
      onHandlerError: (error, event) =>
        console.error(
          `Fallo al procesar ${event.type}:`,
          error instanceof Error ? error.stack : error,
        ),
    });

  const access = createAccessModule({
    prisma: deps.prisma,
    jwtSecret: deps.jwtSecret,
    invitationSender: deps.invitationSender,
    authRateLimits: deps.authRateLimits,
  });
  const announcements = createAnnouncementsModule({
    prisma: deps.prisma,
    files: deps.files,
    events,
    members: access.directory,
    requireCooperative: access.requireCooperative,
  });
  const documents = createDocumentsModule({
    prisma: deps.prisma,
    files: deps.files,
    events,
    members: access.directory,
    requireCooperative: access.requireCooperative,
    embedder: deps.embedder,
  });

  const assemblies = createAssembliesModule({
    prisma: deps.prisma,
    files: deps.files,
    events,
    members: access.directory,
    requireCooperative: access.requireCooperative,
  });

  const invoicing = createInvoicingModule({
    prisma: deps.prisma,
    files: deps.files,
    events,
    requireCooperative: access.requireCooperative,
  });

  const app = createApp({
    routers: [
      access.router,
      announcements.router,
      documents.router,
      assemblies.router,
      invoicing.router,
    ],
    errorHandlers: [
      access.errorHandler,
      announcements.errorHandler,
      documents.errorHandler,
      assemblies.errorHandler,
      invoicing.errorHandler,
    ],
    trustProxy: deps.trustProxy,
  });
  return {
    app,
    indexing: documents.indexing,
    runDueDates: () => runDueDatesJob({ prisma: deps.prisma, events }),
  };
}
