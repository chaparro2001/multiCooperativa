import type { PrismaClient } from '../../shared/infrastructure/prisma';
import {
  provisionCooperative,
  type ProvisionCooperativeInput,
} from './application/provision-cooperative';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher';
import { PrismaCooperativeProvisioningStore } from './infrastructure/prisma-cooperative-provisioning-store';

export type { ProvisionCooperativeInput } from './application/provision-cooperative';
export type { ProvisionCooperativeResult } from './application/ports/cooperative-provisioning-store';
export { AccessApplicationError } from './application/errors';
export { AccessDomainError } from './domain/errors';

/** Public interface of the access module: the only entry point for the rest of the backend. */
export function createAccessModule(deps: { prisma: PrismaClient }) {
  const hasher = new Argon2PasswordHasher();
  const provisioningStore = new PrismaCooperativeProvisioningStore(deps.prisma);

  return {
    provisionCooperative: (input: ProvisionCooperativeInput) =>
      provisionCooperative({ store: provisioningStore, hasher }, input),
  };
}

export type AccessModule = ReturnType<typeof createAccessModule>;
