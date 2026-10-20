/** Hosts that are this machine or the docker-compose network: the only ones seeded without a flag. */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
  'host.docker.internal',
  'postgres',
]);

export const ALLOW_PRODUCTION_FLAG = '--allow-production';

/**
 * The sample-data seed is additive and idempotent: it never deletes or updates what exists.
 * Even so, loading demo users into a real database must be deliberate, so anything that is not
 * a local database (or any run with NODE_ENV=production) needs the explicit flag.
 */
export function seedRefusal(input: {
  nodeEnv: string;
  databaseUrl: string;
  allowProduction: boolean;
}): string | null {
  if (input.allowProduction) return null;
  if (input.nodeEnv === 'production') {
    return `NODE_ENV=production: pass ${ALLOW_PRODUCTION_FLAG} to load the sample data.`;
  }
  const host = new URL(input.databaseUrl).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    return `DATABASE_URL points to a remote database (${host}): pass ${ALLOW_PRODUCTION_FLAG} to load the sample data there.`;
  }
  return null;
}
