import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from '../../generated/prisma/client';

export type { PrismaClient };
/** Tagged SQL helpers (`Prisma.sql`, `Prisma.join`) for queries the client cannot express. */
export { Prisma };

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
