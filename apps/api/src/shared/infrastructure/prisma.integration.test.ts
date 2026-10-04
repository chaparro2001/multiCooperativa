import { afterAll, describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env';
import { createPrismaClient } from './prisma';

const prisma = createPrismaClient(loadEnv(process.env).DATABASE_URL);

afterAll(() => prisma.$disconnect());

describe('base de datos', () => {
  it('tiene la extensión pgvector instalada por las migraciones', async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;

    expect(rows).toEqual([{ extname: 'vector' }]);
  });
});
