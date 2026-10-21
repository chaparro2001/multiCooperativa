import type { RequestHandler } from 'express';

import type { EventPublisher } from '../../shared/events';
import type { FileStorage } from '../../shared/files/file-storage';
import type { PrismaClient } from '../../shared/infrastructure/prisma';
import { createAssemblyReads } from './application/assistant-reads';
import type { AssemblyEvent } from './application/events';
import type { MemberDirectory } from './application/ports/member-directory';
import { createAssembliesRouter } from './infrastructure/http/assemblies-router';
import { assemblyErrorHandler } from './infrastructure/http/error-handler';
import { PrismaAssemblyStore } from './infrastructure/prisma-assembly-store';
import { PrismaSettingsStore } from './infrastructure/prisma-settings-store';
import { PrismaVotingStore } from './infrastructure/prisma-voting-store';

export type {
  AssemblyReads,
  AssemblyResults,
  UpcomingAssembly,
} from './application/assistant-reads';
export type {
  AssemblyConvened,
  AssemblyEvent,
  AssemblyRescheduled,
  VotingClosed,
  VotingOpened,
} from './application/events';

/** Public interface of the assemblies module (docs/requirements/04-assemblies.md). */
export function createAssembliesModule(deps: {
  prisma: PrismaClient;
  files: FileStorage;
  events: EventPublisher<AssemblyEvent>;
  members: MemberDirectory;
  requireCooperative: RequestHandler;
  now?: () => Date;
}) {
  const useCaseDeps = {
    assemblies: new PrismaAssemblyStore(deps.prisma),
    votings: new PrismaVotingStore(deps.prisma),
    settings: new PrismaSettingsStore(deps.prisma),
    members: deps.members,
    files: deps.files,
    events: deps.events,
    now: deps.now ?? (() => new Date()),
  };
  return {
    router: createAssembliesRouter(useCaseDeps, deps.requireCooperative),
    errorHandler: assemblyErrorHandler,
    /** For the AI assistant's tools (requirements/07): same use cases and permissions. */
    reads: createAssemblyReads(useCaseDeps),
  };
}
