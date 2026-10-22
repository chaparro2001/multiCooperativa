import { afterAll, describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env';
import { createTestPrisma } from '../../../test/database';
import { createPrismaClient } from './prisma';

const prisma = createTestPrisma();

afterAll(() => prisma.$disconnect());

describe('database', () => {
  it('has the pgvector extension installed by the migrations', async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;

    expect(rows).toEqual([{ extname: 'vector' }]);
  });

  it('applies the statement timeout to the API connections only', async () => {
    const limited = createPrismaClient(loadEnv(process.env).DATABASE_URL, {
      statementTimeoutMs: 1234,
    });
    try {
      const [limit] = await limited.$queryRaw<
        { statement_timeout: string }[]
      >`SHOW statement_timeout`;
      const [plain] = await prisma.$queryRaw<
        { statement_timeout: string }[]
      >`SHOW statement_timeout`;
      expect(limit?.statement_timeout).toBe('1234ms');
      expect(plain?.statement_timeout).toBe('0');
    } finally {
      await limited.$disconnect();
    }
  });
});
