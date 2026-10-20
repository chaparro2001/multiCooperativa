import { describe, expect, it } from 'vitest';

import { WeakPasswordError } from '../domain/errors';
import { PREDEFINED_PROFILES } from '../domain/predefined-profiles';
import {
  AdminNotActivatedError,
  CooperativeAlreadyExistsError,
  PasswordRequiredError,
} from './errors';
import type { PasswordHasher } from './ports/password-hasher';
import type {
  CooperativeProvisioningStore,
  ProvisionCooperativeData,
} from './ports/cooperative-provisioning-store';
import { provisionCooperative } from './provision-cooperative';

const hasher: PasswordHasher = {
  hash: async (password) => `hashed(${password})`,
  verify: async (hash, password) => hash === `hashed(${password})`,
};

function createStore(
  initial: {
    users?: { id: string; email: string; hasPassword: boolean }[];
    cifs?: string[];
  } = {},
) {
  const provisioned: ProvisionCooperativeData[] = [];
  const store: CooperativeProvisioningStore = {
    findUserByEmail: async (email) => initial.users?.find((user) => user.email === email) ?? null,
    cooperativeExistsByCif: async (cif) => initial.cifs?.includes(cif) ?? false,
    provision: async (data) => {
      provisioned.push(data);
      return { cooperativeId: 'coop-1', adminUserId: 'user-1', adminMembershipId: 'mem-1' };
    },
  };
  return { store, provisioned };
}

const input = {
  name: 'Cooperativa del Campo',
  cif: ' f12345678 ',
  admin: { email: 'Admin@Campo.es', name: 'Ada', password: 'a-long-password' },
};

describe('provisionCooperative', () => {
  it('creates the cooperative with the 4 predefined profiles and an administrator', async () => {
    const { store, provisioned } = createStore();

    const result = await provisionCooperative({ store, hasher }, input);

    expect(result).toEqual({
      cooperativeId: 'coop-1',
      adminUserId: 'user-1',
      adminMembershipId: 'mem-1',
    });
    expect(provisioned).toEqual([
      {
        name: 'Cooperativa del Campo',
        cif: 'F12345678',
        profiles: PREDEFINED_PROFILES,
        adminProfileName: 'Administrador',
        admin: {
          kind: 'new',
          email: 'admin@campo.es',
          name: 'Ada',
          passwordHash: 'hashed(a-long-password)',
        },
      },
    ]);
  });

  it('reuses the existing user without asking for another password', async () => {
    const { store, provisioned } = createStore({
      users: [{ id: 'user-9', email: 'admin@campo.es', hasPassword: true }],
    });

    await provisionCooperative(
      { store, hasher },
      { ...input, admin: { email: 'admin@campo.es', name: 'Ada' } },
    );

    expect(provisioned[0]?.admin).toEqual({ kind: 'existing', userId: 'user-9' });
  });

  it('requires a password if the administrator is a new user', async () => {
    const { store, provisioned } = createStore();

    await expect(
      provisionCooperative(
        { store, hasher },
        { ...input, admin: { email: 'admin@campo.es', name: 'Ada' } },
      ),
    ).rejects.toThrow(PasswordRequiredError);
    expect(provisioned).toEqual([]);
  });

  it('rejects an invited user who has not activated their access yet', async () => {
    const { store, provisioned } = createStore({
      users: [{ id: 'user-9', email: 'admin@campo.es', hasPassword: false }],
    });

    await expect(provisionCooperative({ store, hasher }, input)).rejects.toThrow(
      AdminNotActivatedError,
    );
    expect(provisioned).toEqual([]);
  });

  it('applies the password policy (NFR-ACC-01)', async () => {
    const { store, provisioned } = createStore();

    await expect(
      provisionCooperative(
        { store, hasher },
        { ...input, admin: { ...input.admin, password: 'corta' } },
      ),
    ).rejects.toThrow(WeakPasswordError);
    expect(provisioned).toEqual([]);
  });

  it('rejects an already registered tax id', async () => {
    const { store, provisioned } = createStore({ cifs: ['F12345678'] });

    await expect(provisionCooperative({ store, hasher }, input)).rejects.toThrow(
      CooperativeAlreadyExistsError,
    );
    expect(provisioned).toEqual([]);
  });
});
