import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import { purgeExpiredAuthRecords } from '../application/purge-expired-auth-records';
import { PrismaAuthRecordsStore } from './prisma-auth-records-store';

const prisma = createTestPrisma();
const NOW = new Date('2026-10-22T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
let userId = '';

beforeEach(async () => {
  await resetDatabase(prisma);
  userId = (await prisma.user.create({ data: { email: 'a@test.local', name: 'A' } })).id;
});
afterAll(() => prisma.$disconnect());

const session = (expiresAt: Date, revokedAt: Date | null = null) =>
  prisma.session.create({ data: { userId, refreshTokenHash: 'h', expiresAt, revokedAt } });

describe('PrismaAuthRecordsStore', () => {
  it('NFR-ACC-02 purges sessions expired or revoked more than 7 days ago and keeps the rest', async () => {
    await session(ago(8 * DAY));
    await session(ago(-DAY), ago(8 * DAY));
    const expiredRecently = await session(ago(DAY));
    const revokedRecently = await session(ago(-DAY), ago(DAY));
    const live = await session(ago(-DAY));

    const result = await purgeExpiredAuthRecords({
      records: new PrismaAuthRecordsStore(prisma),
      now: () => NOW,
    });

    expect(result.sessions).toBe(2);
    const left = await prisma.session.findMany({ select: { id: true } });
    expect(left.map((row) => row.id).sort()).toEqual(
      [expiredRecently.id, revokedRecently.id, live.id].sort(),
    );
  });

  it('BR-ACC-11 purges failed attempts older than an hour and keeps recent ones', async () => {
    await prisma.failedLoginAttempt.createMany({
      data: [
        { email: 'a@test.local', occurredAt: ago(2 * HOUR) },
        { email: 'a@test.local', occurredAt: ago(10 * 60_000) },
      ],
    });

    const result = await purgeExpiredAuthRecords({
      records: new PrismaAuthRecordsStore(prisma),
      now: () => NOW,
    });

    expect(result.failedAttempts).toBe(1);
    expect(await prisma.failedLoginAttempt.count()).toBe(1);
  });
});
