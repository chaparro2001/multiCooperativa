import { existsSync } from 'node:fs';

import { defineConfig } from 'prisma/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `prisma migrate reset` y `prisma db seed` cargan los datos de ejemplo.
    seed: 'tsx scripts/seed.ts',
  },
  datasource: {
    // `prisma generate` no necesita la base de datos; las migraciones sí exigen DATABASE_URL.
    url: process.env.DATABASE_URL ?? '',
  },
});
