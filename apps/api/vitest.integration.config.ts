import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Los tests de integración vacían las tablas: usan su propia base de datos (sufijo _test).
const url = new URL(process.env.DATABASE_URL ?? '');
url.pathname = `${url.pathname}_test`;
process.env.DATABASE_URL = url.toString();

export default defineConfig({
  test: {
    name: 'api-integration',
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['test/integration-global-setup.ts'],
    env: { DATABASE_URL: url.toString() },
    fileParallelism: false,
  },
});
