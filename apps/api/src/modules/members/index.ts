import type { RequestHandler } from 'express';

import type { PrismaClient } from '../../shared/infrastructure/prisma';
import { createMemberAreaReads } from './application/assistant-reads';
import type { MemberDirectory } from './application/ports/member-directory';
import { membersErrorHandler } from './infrastructure/http/error-handler';
import { createMemberAreaRouter } from './infrastructure/http/member-area-router';
import { PrismaCapitalStore } from './infrastructure/prisma-capital-store';

export type {
  CapitalSummaryView,
  CensusView,
  MemberAreaReads,
  MyContributions,
  PartnerDetail,
  PartnerIdentity,
} from './application/assistant-reads';

/** Public interface of the member area module (docs/requirements/06-member-area.md). */
export function createMembersModule(deps: {
  prisma: PrismaClient;
  /** From the access module's public interface. */
  members: MemberDirectory;
  requireCooperative: RequestHandler;
}) {
  const useCaseDeps = { capital: new PrismaCapitalStore(deps.prisma), members: deps.members };
  return {
    router: createMemberAreaRouter(useCaseDeps, deps.requireCooperative),
    errorHandler: membersErrorHandler,
    /** For the AI assistant's tools (requirements/07): same use cases and permissions. */
    reads: createMemberAreaReads(useCaseDeps),
  };
}
