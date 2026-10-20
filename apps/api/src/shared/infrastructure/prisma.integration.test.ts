import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '../../../test/database';

const prisma = createTestPrisma();

afterAll(() => prisma.$disconnect());

describe('database', () => {
  it('has the pgvector extension installed by the migrations', async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;

    expect(rows).toEqual([{ extname: 'vector' }]);
  });
});
