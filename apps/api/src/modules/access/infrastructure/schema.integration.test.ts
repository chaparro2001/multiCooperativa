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

describe('access schema constraints', () => {
  it('BR-ACC-01: the email is unique across the platform', async () => {
    const { user } = await seed();

    await expect(
      prisma.user.create({ data: { email: user.email, name: 'Another Ana' } }),
    ).rejects.toThrow();
  });

  it('BR-ACC-02: a user cannot have two live memberships in the same cooperative', async () => {
    const { coopA, profileA, user } = await seed();
    const data = { userId: user.id, cooperativeId: coopA.id, profileId: profileA.id };
    await prisma.membership.create({ data: { ...data, status: 'active' } });

    await expect(prisma.membership.create({ data })).rejects.toThrow();
  });

  it('BR-ACC-14: after a removal a new membership can be created and the old one is kept', async () => {
    const { coopA, profileA, user } = await seed();
    const data = { userId: user.id, cooperativeId: coopA.id, profileId: profileA.id };
    await prisma.membership.create({ data: { ...data, status: 'removed' } });

    await prisma.membership.create({ data });

    const statuses = await prisma.membership.findMany({
      where: { userId: user.id, cooperativeId: coopA.id },
      select: { status: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(statuses.map(({ status }) => status).sort()).toEqual(['invited', 'removed']);
  });

  it('BR-ACC-03: the profile of a membership must belong to the same cooperative', async () => {
    const { coopA, profileB, user } = await seed();

    await expect(
      prisma.membership.create({
        data: { userId: user.id, cooperativeId: coopA.id, profileId: profileB.id },
      }),
    ).rejects.toThrow();
  });

  it('the same user can belong to several cooperatives (ADR-003)', async () => {
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
