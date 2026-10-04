import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';

const prisma = createTestPrisma();

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

async function seed() {
  const [coopA, coopB] = await Promise.all([
    prisma.cooperative.create({ data: { name: 'Coop A', cif: 'F00000001' } }),
    prisma.cooperative.create({ data: { name: 'Coop B', cif: 'F00000002' } }),
  ]);
  const [profileA, profileB] = await Promise.all([
    prisma.profile.create({ data: { cooperativeId: coopA.id, name: 'Socio', predefined: true } }),
    prisma.profile.create({ data: { cooperativeId: coopB.id, name: 'Socio', predefined: true } }),
  ]);
  const user = await prisma.user.create({ data: { email: 'ana@example.com', name: 'Ana' } });
  return { coopA, coopB, profileA, profileB, user };
}

describe('restricciones del esquema de acceso', () => {
  it('RN-ACC-01: el email es único en toda la plataforma', async () => {
    const { user } = await seed();

    await expect(
      prisma.user.create({ data: { email: user.email, name: 'Otra Ana' } }),
    ).rejects.toThrow();
  });

  it('RN-ACC-02: un usuario no puede tener dos membresías vivas en la misma cooperativa', async () => {
    const { coopA, profileA, user } = await seed();
    const data = { userId: user.id, cooperativeId: coopA.id, profileId: profileA.id };
    await prisma.membership.create({ data: { ...data, status: 'activa' } });

    await expect(prisma.membership.create({ data })).rejects.toThrow();
  });

  it('RN-ACC-14: tras una baja se puede crear una membresía nueva y la antigua se conserva', async () => {
    const { coopA, profileA, user } = await seed();
    const data = { userId: user.id, cooperativeId: coopA.id, profileId: profileA.id };
    await prisma.membership.create({ data: { ...data, status: 'baja' } });

    await prisma.membership.create({ data });

    const statuses = await prisma.membership.findMany({
      where: { userId: user.id, cooperativeId: coopA.id },
      select: { status: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(statuses.map(({ status }) => status).sort()).toEqual(['baja', 'invitada']);
  });

  it('RN-ACC-03: el perfil de una membresía debe ser de su misma cooperativa', async () => {
    const { coopA, profileB, user } = await seed();

    await expect(
      prisma.membership.create({
        data: { userId: user.id, cooperativeId: coopA.id, profileId: profileB.id },
      }),
    ).rejects.toThrow();
  });

  it('un mismo usuario puede pertenecer a varias cooperativas (ADR-003)', async () => {
    const { coopA, coopB, profileA, profileB, user } = await seed();

    await prisma.membership.create({
      data: { userId: user.id, cooperativeId: coopA.id, profileId: profileA.id },
    });
    await prisma.membership.create({
      data: { userId: user.id, cooperativeId: coopB.id, profileId: profileB.id },
    });

    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(2);
  });
});
