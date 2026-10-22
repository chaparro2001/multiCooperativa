import { PrismaPg } from '@prisma/adapter-pg';

import { Prisma, PrismaClient } from '../../generated/prisma/client';

export type { PrismaClient };
/** Tagged SQL helpers (`Prisma.sql`, `Prisma.join`) for queries the client cannot express. */
export { Prisma };

/** Connection pool of the API (node-postgres); the defaults suit a small single-node deployment. */
export interface PoolOptions {
  /** Maximum connections in the pool. */
  max?: number;
  /** How long to wait for a free connection before failing, instead of queueing forever. */
  connectionTimeoutMs?: number;
  /** Idle connections are closed after this long. */
  idleTimeoutMs?: number;
  /**
   * Server-side limit per statement, set on the API's own connections only (so migrations and
   * the maintenance scripts, which connect on their own, are not affected). 0 or unset: none.
   */
  statementTimeoutMs?: number;
}

export const DEFAULT_POOL_OPTIONS = {
  max: 10,
  connectionTimeoutMs: 5_000,
  idleTimeoutMs: 30_000,
} as const;

export function createPrismaClient(databaseUrl: string, pool: PoolOptions = {}): PrismaClient {
  const options = { ...DEFAULT_POOL_OPTIONS, ...pool };
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: options.max,
    connectionTimeoutMillis: options.connectionTimeoutMs,
    idleTimeoutMillis: options.idleTimeoutMs,
    ...(options.statementTimeoutMs ? { statement_timeout: options.statementTimeoutMs } : {}),
  });
  return new PrismaClient({ adapter });
}
