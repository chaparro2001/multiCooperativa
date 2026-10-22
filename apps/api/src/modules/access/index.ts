import { Router } from 'express';

import type { PrismaClient } from '../../shared/infrastructure/prisma';
import { acceptInvitation } from './application/accept-invitation';
import { login } from './application/login';
import {
  changeMember,
  inviteMember,
  getMember,
  listAudit,
  listMembers,
  listProfiles,
  removeMember,
  resendInvitation,
} from './application/members';
import type { InvitationSender } from './application/ports/invitation-sender';
import { logout } from './application/logout';
import {
  provisionCooperative,
  type ProvisionCooperativeInput,
} from './application/provision-cooperative';
import { purgeExpiredAuthRecords } from './application/purge-expired-auth-records';
import { refreshSession } from './application/refresh-session';
import {
  authenticateRequest,
  getMe,
  resolveCooperativeContext,
} from './application/request-context';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { CryptoSecretTokens } from './infrastructure/crypto-secret-tokens';
import {
  createRequireCooperative,
  createRequireSession,
} from './infrastructure/http/access-middleware';
import {
  type AuthRateLimits,
  createAuthRouter,
  DEFAULT_AUTH_RATE_LIMITS,
} from './infrastructure/http/auth-router';
import { accessErrorHandler } from './infrastructure/http/error-handler';
import { createMeRouter } from './infrastructure/http/me-router';
import { createMembersRouter } from './infrastructure/http/members-router';
import { JoseAccessTokens } from './infrastructure/jose-access-tokens';
import { PrismaAccessContextStore } from './infrastructure/prisma-access-context-store';
import { PrismaAuthRecordsStore } from './infrastructure/prisma-auth-records-store';
import { PrismaCooperativeProvisioningStore } from './infrastructure/prisma-cooperative-provisioning-store';
import { PrismaInvitationStore } from './infrastructure/prisma-invitation-store';
import { PrismaLoginStore } from './infrastructure/prisma-login-store';
import { PrismaMemberDirectory } from './infrastructure/prisma-member-directory';
import { PrismaMemberStore } from './infrastructure/prisma-member-store';
import { PrismaSessionStore } from './infrastructure/prisma-session-store';

export type { ProvisionCooperativeInput } from './application/provision-cooperative';
export type { ProvisionCooperativeResult } from './application/ports/cooperative-provisioning-store';
export type { CooperativeContext, SessionContext } from './application/request-context';
export type { AccessLevel, Module, Scope } from './domain/permission';
export { AccessApplicationError } from './application/errors';
export { AccessDomainError, ModuleAccessDeniedError } from './domain/errors';
/** Guard for use cases: returns the scope to filter by, or throws 403 (US-ACC-07). */
export { requireAccess } from './domain/permission';
export { hasAccess } from './domain/permission';
/** The four profiles every cooperative is born with (requisitos/01, section 3). */
export { PREDEFINED_PROFILES } from './domain/predefined-profiles';
export {
  getCooperativeContext,
  getSessionContext,
  requirePermission,
} from './infrastructure/http/access-middleware';
export type { AuthRateLimits } from './infrastructure/http/auth-router';
export type { InvitationSender } from './application/ports/invitation-sender';
export {
  ConsoleInvitationSender,
  createInvitationSender,
  invitationLink,
  invitationWebUrl,
  LinkInvitationSender,
  UnavailableInvitationSender,
} from './infrastructure/invitation-senders';

export interface AccessModuleDeps {
  prisma: PrismaClient;
  jwtSecret: string;
  now?: () => Date;
  /** NFR-ACC-09; false disables it (tests). */
  authRateLimits?: AuthRateLimits | false;
  /** Delivers invitation links (US-ACC-08). */
  invitationSender: InvitationSender;
}

/** Public interface of the access module: the only entry point for the rest of the backend. */
export function createAccessModule(deps: AccessModuleDeps) {
  const hasher = new Argon2PasswordHasher();
  const jwt = new JoseAccessTokens(deps.jwtSecret);
  const sessionDeps = {
    sessions: new PrismaSessionStore(deps.prisma),
    accessTokens: jwt,
    secrets: new CryptoSecretTokens(),
    now: deps.now ?? (() => new Date()),
  };
  const loginDeps = { ...sessionDeps, loginStore: new PrismaLoginStore(deps.prisma), hasher };
  const invitationDeps = {
    ...sessionDeps,
    invitations: new PrismaInvitationStore(deps.prisma),
    hasher,
  };
  const contextDeps = { contexts: new PrismaAccessContextStore(deps.prisma) };
  const provisioningStore = new PrismaCooperativeProvisioningStore(deps.prisma);
  const memberDeps = {
    members: new PrismaMemberStore(deps.prisma),
    secrets: sessionDeps.secrets,
    invitationSender: deps.invitationSender,
    now: sessionDeps.now,
  };

  const requestContext = {
    authenticate: (accessToken: string | undefined) =>
      authenticateRequest({ ...sessionDeps, accessTokens: jwt }, accessToken),
    resolveCooperative: (session: Parameters<typeof resolveCooperativeContext>[1], id: string) =>
      resolveCooperativeContext(contextDeps, session, id),
  };
  /** 401 without a valid access token of an open session. */
  const requireSession = createRequireSession(requestContext);
  /** For `/cooperatives/:cooperativeId/...`: 401 without session, 404 without an active membership. */
  const requireCooperative = createRequireCooperative(requestContext);

  const router = Router();
  router.use(
    createAuthRouter(
      {
        login: (input) => login(loginDeps, input),
        refreshSession: (token) => refreshSession(sessionDeps, token),
        logout: (token) => logout(sessionDeps, token),
        acceptInvitation: (input) => acceptInvitation(invitationDeps, input),
      },
      deps.authRateLimits ?? DEFAULT_AUTH_RATE_LIMITS,
    ),
  );
  router.use(
    createMeRouter({
      getMe: (session) => getMe(contextDeps, session),
      requireSession,
      requireCooperative,
    }),
  );
  router.use(
    createMembersRouter(
      {
        listMembers: (context, filter, page) => listMembers(memberDeps, context, filter, page),
        getMember: (context, id) => getMember(memberDeps, context, id),
        listProfiles: (context) => listProfiles(memberDeps, context),
        inviteMember: (context, input) => inviteMember(memberDeps, context, input),
        changeMember: (context, id, change) => changeMember(memberDeps, context, id, change),
        removeMember: (context, id) => removeMember(memberDeps, context, id),
        resendInvitation: (context, id) => resendInvitation(memberDeps, context, id),
        listAudit: (context) => listAudit(memberDeps, context),
      },
      requireCooperative,
    ),
  );

  const authRecords = new PrismaAuthRecordsStore(deps.prisma);

  return {
    /** Hourly housekeeping: expired or revoked sessions and old failed logins. Idempotent. */
    purgeExpiredAuthRecords: () =>
      purgeExpiredAuthRecords({ records: authRecords, now: sessionDeps.now }),
    provisionCooperative: (input: ProvisionCooperativeInput) =>
      provisionCooperative({ store: provisioningStore, hasher }, input),
    requireSession,
    requireCooperative,
    /** Lets another module leave a trace in the cooperative's audit log (US-ACC-12); the actor is also the subject. */
    recordAudit: (
      cooperativeId: string,
      event: { actorUserId: string; action: string; detail: Record<string, unknown> },
    ) => memberDeps.members.recordAudit(cooperativeId, event.actorUserId, event),
    /** Member data for other modules, always scoped to a cooperative. */
    directory: new PrismaMemberDirectory(deps.prisma),
    router,
    errorHandler: accessErrorHandler,
  };
}

export type AccessModule = ReturnType<typeof createAccessModule>;
