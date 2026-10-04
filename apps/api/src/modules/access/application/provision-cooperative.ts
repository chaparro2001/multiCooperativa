import { normalizeEmail } from '../domain/email';
import { assertPasswordPolicy } from '../domain/password-policy';
import { PREDEFINED_PROFILES } from '../domain/predefined-profiles';
import {
  AdminNotActivatedError,
  CooperativeAlreadyExistsError,
  PasswordRequiredError,
} from './errors';
import type {
  CooperativeProvisioningStore,
  ProvisionCooperativeResult,
  ProvisionedAdmin,
} from './ports/cooperative-provisioning-store';
import type { PasswordHasher } from './ports/password-hasher';

export interface ProvisionCooperativeInput {
  name: string;
  cif: string;
  admin: { email: string; name: string; password?: string };
}

/**
 * Platform operation (run from a script, not exposed over HTTP): creates a
 * cooperative with its 4 predefined profiles and a first active administrator.
 */
export async function provisionCooperative(
  deps: { store: CooperativeProvisioningStore; hasher: PasswordHasher },
  input: ProvisionCooperativeInput,
): Promise<ProvisionCooperativeResult> {
  const cif = input.cif.trim().toUpperCase();
  const email = normalizeEmail(input.admin.email);

  if (await deps.store.cooperativeExistsByCif(cif)) {
    throw new CooperativeAlreadyExistsError(cif);
  }

  const existing = await deps.store.findUserByEmail(email);
  let admin: ProvisionedAdmin;
  if (existing?.hasPassword) {
    admin = { kind: 'existing', userId: existing.id };
  } else if (existing) {
    // Invited elsewhere but never activated: this script does not take over that account.
    throw new AdminNotActivatedError();
  } else {
    if (!input.admin.password) throw new PasswordRequiredError();
    assertPasswordPolicy(input.admin.password);
    admin = {
      kind: 'new',
      email,
      name: input.admin.name.trim(),
      passwordHash: await deps.hasher.hash(input.admin.password),
    };
  }

  return deps.store.provision({
    name: input.name.trim(),
    cif,
    profiles: PREDEFINED_PROFILES,
    adminProfileName: 'Administrador',
    admin,
  });
}
