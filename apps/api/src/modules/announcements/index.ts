import type { RequestHandler } from 'express';

import type { EventBus } from '../../shared/events';
import type { FileStorage } from '../../shared/files/file-storage';
import type { PrismaClient } from '../../shared/infrastructure/prisma';
import type { AnnouncementEvent } from './application/events';
import type { MemberDirectory } from './application/ports/member-directory';
import { createAnnouncementsRouter } from './infrastructure/http/announcements-router';
import { announcementErrorHandler } from './infrastructure/http/error-handler';
import { PrismaAnnouncementStore } from './infrastructure/prisma-announcement-store';

export type { AnnouncementEvent, AnnouncementPublished } from './application/events';

/** Public interface of the announcements module (requisitos/02). */
export function createAnnouncementsModule(deps: {
  prisma: PrismaClient;
  files: FileStorage;
  events: EventBus<AnnouncementEvent>;
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
    router: createAnnouncementsRouter(useCaseDeps, deps.requireCooperative),
    errorHandler: announcementErrorHandler,
  };
}
