import { type RequestHandler, Router } from 'express';

import type { EventPublisher } from '../../shared/events';
import type { FileStorage } from '../../shared/files/file-storage';
import type { PrismaClient } from '../../shared/infrastructure/prisma';
import { createAnnouncementReads } from './application/assistant-reads';
import type { AnnouncementEvent } from './application/events';
import type { MemberDirectory } from './application/ports/member-directory';
import { createUnreadRouter } from './infrastructure/http/unread-router';
import { PrismaUnreadStore } from './infrastructure/prisma-unread-store';
import { createAnnouncementsRouter } from './infrastructure/http/announcements-router';
import { announcementErrorHandler } from './infrastructure/http/error-handler';
import { PrismaAnnouncementStore } from './infrastructure/prisma-announcement-store';

export type { AnnouncementReads, LatestAnnouncement } from './application/assistant-reads';
export type { AnnouncementEvent, AnnouncementPublished } from './application/events';

/** Public interface of the announcements module (docs/requirements/02-announcements.md). */
export function createAnnouncementsModule(deps: {
  prisma: PrismaClient;
  files: FileStorage;
  events: EventPublisher<AnnouncementEvent>;
  /** From the access module's public interface. */
  members: MemberDirectory;
  requireCooperative: RequestHandler;
  now?: () => Date;
}) {
  const useCaseDeps = {
    announcements: new PrismaAnnouncementStore(deps.prisma),
    members: deps.members,
    files: deps.files,
    events: deps.events,
    now: deps.now ?? (() => new Date()),
  };
  return {
    router: Router().use(
      createUnreadRouter({ unread: new PrismaUnreadStore(deps.prisma) }, deps.requireCooperative),
      createAnnouncementsRouter(useCaseDeps, deps.requireCooperative),
    ),
    errorHandler: announcementErrorHandler,
    /** For the AI assistant's tools (requirements/07): same use cases and permissions. */
    reads: createAnnouncementReads(useCaseDeps),
  };
}
