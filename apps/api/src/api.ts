import type { Express } from 'express';

import { createApp } from './app';
import { type AuthRateLimits, createAccessModule, type InvitationSender } from './modules/access';
import { type AnnouncementEvent, createAnnouncementsModule } from './modules/announcements';
import { createDocumentsModule, type DocumentEvent } from './modules/documents';
import { type EventBus, InProcessEventBus } from './shared/events';
import type { FileStorage } from './shared/files/file-storage';
import type { PrismaClient } from './shared/infrastructure/prisma';

/** Every internal event of the app: the union grows with each module that emits. */
export type AppEvent = AnnouncementEvent | DocumentEvent;

export interface ApiDeps {
  prisma: PrismaClient;
  jwtSecret: string;
  invitationSender: InvitationSender;
  files: FileStorage;
  /** Injectable so tests can observe the events; one in-process bus by default. */
  events?: EventBus<AppEvent>;
  authRateLimits?: AuthRateLimits | false;
  trustProxy?: number | false;
}

/**
 * Wires every module into the HTTP app. The only composition root: `main.ts`
 * runs it and the isolation test walks all the routes it registers.
 */
export function createApi(deps: ApiDeps): Express {
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
  });

  return createApp({
    routers: [access.router, announcements.router, documents.router],
    errorHandlers: [access.errorHandler, announcements.errorHandler, documents.errorHandler],
    trustProxy: deps.trustProxy,
  });
}
