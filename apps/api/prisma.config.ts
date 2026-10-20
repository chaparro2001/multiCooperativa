import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `prisma migrate reset` and `prisma db seed` load the sample data.
    seed: 'tsx scripts/seed.ts',
  },
  datasource: {
    // `prisma generate` does not need the database; migrations do. With a pooled runtime URL
    // (Neon), DIRECT_URL is the non-pooled one that migrations need; locally only DATABASE_URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
});
