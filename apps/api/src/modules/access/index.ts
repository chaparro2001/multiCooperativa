import type { PrismaClient } from '../../shared/infrastructure/prisma';
import { acceptInvitation } from './application/accept-invitation';
import { login } from './application/login';
import { logout } from './application/logout';
import {
  provisionCooperative,
  type ProvisionCooperativeInput,
} from './application/provision-cooperative';
import { refreshSession } from './application/refresh-session';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { CryptoSecretTokens } from './infrastructure/crypto-secret-tokens';
import { createAuthRouter } from './infrastructure/http/auth-router';
import { JoseAccessTokens } from './infrastructure/jose-access-tokens';
import { PrismaCooperativeProvisioningStore } from './infrastructure/prisma-cooperative-provisioning-store';
import { PrismaInvitationStore } from './infrastructure/prisma-invitation-store';
import { PrismaLoginStore } from './infrastructure/prisma-login-store';
import { PrismaSessionStore } from './infrastructure/prisma-session-store';

export type { ProvisionCooperativeInput } from './application/provision-cooperative';
export type { ProvisionCooperativeResult } from './application/ports/cooperative-provisioning-store';
export { AccessApplicationError } from './application/errors';
export { AccessDomainError } from './domain/errors';

export interface AccessModuleDeps {
  prisma: PrismaClient;
  jwtSecret: string;
  now?: () => Date;
}

/** Public interface of the access module: the only entry point for the rest of the backend. */
export function createAccessModule(deps: AccessModuleDeps) {
  const hasher = new Argon2PasswordHasher();
  const sessionDeps = {
    sessions: new PrismaSessionStore(deps.prisma),
    accessTokens: new JoseAccessTokens(deps.jwtSecret),
    secrets: new CryptoSecretTokens(),
    now: deps.now ?? (() => new Date()),
  };
  const loginDeps = { ...sessionDeps, loginStore: new PrismaLoginStore(deps.prisma), hasher };
  const invitationDeps = {
    ...sessionDeps,
    invitations: new PrismaInvitationStore(deps.prisma),
    hasher,
  };
  const provisioningStore = new PrismaCooperativeProvisioningStore(deps.prisma);

  return {
    provisionCooperative: (input: ProvisionCooperativeInput) =>
      provisionCooperative({ store: provisioningStore, hasher }, input),
    router: createAuthRouter({
      login: (input) => login(loginDeps, input),
      refreshSession: (token) => refreshSession(sessionDeps, token),
      logout: (token) => logout(sessionDeps, token),
      acceptInvitation: (input) => acceptInvitation(invitationDeps, input),
    }),
  };
}

export type AccessModule = ReturnType<typeof createAccessModule>;
