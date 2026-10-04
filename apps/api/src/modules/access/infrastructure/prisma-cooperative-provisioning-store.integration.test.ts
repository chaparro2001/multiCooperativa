import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import { provisionCooperative } from '../application/provision-cooperative';
import { MODULES, resolveAccess } from '../domain/permission';
import { PREDEFINED_PROFILES } from '../domain/predefined-profiles';
import { Argon2PasswordHasher } from './argon2-password-hasher';
import { toDomainPermission } from './permission-mapper';
import { PrismaCooperativeProvisioningStore } from './prisma-cooperative-provisioning-store';

const prisma = createTestPrisma();
const deps = {
  store: new PrismaCooperativeProvisioningStore(prisma),
  hasher: new Argon2PasswordHasher(),
};

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

const input = {
  name: 'Cooperativa del Campo',
  cif: 'F12345678',
  admin: { email: 'admin@campo.es', name: 'Ada', password: 'una-clave-larga' },
};

describe('alta de cooperativa', () => {
  it('persiste los 4 perfiles predefinidos con la matriz de permisos de la especificación', async () => {
    const { cooperativeId } = await provisionCooperative(deps, input);

    const profiles = await prisma.profile.findMany({
      where: { cooperativeId },
      include: { permissions: true },
    });

    expect(profiles).toHaveLength(4);
    for (const expected of PREDEFINED_PROFILES) {
      const stored = profiles.find((profile) => profile.name === expected.name)!;
      const permissions = stored.permissions.map(toDomainPermission);
      expect(stored.predefined).toBe(true);
      for (const module of MODULES) {
        for (const level of ['consulta', 'gestion'] as const) {
          expect(resolveAccess(permissions, module, level)).toEqual(
            resolveAccess(expected.permissions, module, level),
          );
        }
      }
    }
  });

  it('crea al administrador con membresía activa y contraseña en Argon2id', async () => {
    const result = await provisionCooperative(deps, input);

    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: result.adminMembershipId },
      include: { profile: true, user: true },
    });
    expect(membership).toMatchObject({
      cooperativeId: result.cooperativeId,
      status: 'activa',
      profile: { name: 'Administrador' },
      user: { email: 'admin@campo.es', name: 'Ada' },
    });
    expect(membership.user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('un usuario existente administra una segunda cooperativa sin duplicarse (ADR-003)', async () => {
    const first = await provisionCooperative(deps, input);

    const second = await provisionCooperative(deps, {
      name: 'Cooperativa del Mar',
      cif: 'F87654321',
      admin: { email: 'ADMIN@campo.es', name: 'Ada' },
    });

    expect(second.adminUserId).toBe(first.adminUserId);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.membership.count({ where: { userId: first.adminUserId } })).toBe(2);
  });

  it('no deja nada a medias si el CIF ya existe', async () => {
    await provisionCooperative(deps, input);

    await expect(
      provisionCooperative(deps, { ...input, admin: { ...input.admin, email: 'otro@campo.es' } }),
    ).rejects.toThrow(/CIF/);
    expect(await prisma.cooperative.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });
});
