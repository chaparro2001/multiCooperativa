import type { RequestHandler } from 'express';

import type { EventHandler, EventPublisher, Unsubscribe } from '../../shared/events';
import type { FileStorage } from '../../shared/files/file-storage';
import type { PrismaClient } from '../../shared/infrastructure/prisma';
import type { AssemblyRescheduled } from '../assemblies';
import { announceAssemblyRescheduled } from './application/assembly-notices';
import { createAnnouncementReads } from './application/assistant-reads';
import type { AnnouncementEvent } from './application/events';
import type { MemberDirectory } from './application/ports/member-directory';
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
  /** Listens to the assemblies' events (US-ASM-09). */
  onAssemblyRescheduled(handler: EventHandler<AssemblyRescheduled>): Unsubscribe;
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
  deps.onAssemblyRescheduled((event) =>
    announceAssemblyRescheduled(useCaseDeps, event.payload, event.occurredAt),
  );
  return {
    router: createAnnouncementsRouter(useCaseDeps, deps.requireCooperative),
    errorHandler: announcementErrorHandler,
    /** For the AI assistant's tools (requirements/07): same use cases and permissions. */
    reads: createAnnouncementReads(useCaseDeps),
  };
}
