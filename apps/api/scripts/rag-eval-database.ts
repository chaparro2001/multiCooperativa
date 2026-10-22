import { createPrismaClient } from '../src/shared/infrastructure/prisma';

/** The benchmark's own database client (the `_test` database) and the reset the integration tests use. */
export function createTestPrismaFor(url: string) {
  const prisma = createPrismaClient(url);
  return {
    prisma,
    async resetDatabase() {
      const tables = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      if (tables.length === 0) return;
      const names = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
    },
  };
}
