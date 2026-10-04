import { loadEnv } from '../src/config/env';
import { createPrismaClient, type PrismaClient } from '../src/shared/infrastructure/prisma';

export function createTestPrisma(): PrismaClient {
  const { DATABASE_URL } = loadEnv(process.env);
  if (!new URL(DATABASE_URL).pathname.endsWith('_test')) {
    throw new Error('Los tests de integración solo se ejecutan contra una base de datos _test.');
  }
  return createPrismaClient(DATABASE_URL);
}

/** Empties every table except the migrations history. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const names = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}
