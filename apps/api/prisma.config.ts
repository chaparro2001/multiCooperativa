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
    // `prisma generate` does not need the database; migrations do require DATABASE_URL.
    url: process.env.DATABASE_URL ?? '',
  },
});
