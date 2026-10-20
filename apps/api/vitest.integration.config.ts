import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Integration tests empty the tables: they use their own database (`_test` suffix).
const url = new URL(process.env.DATABASE_URL ?? '');
url.pathname = `${url.pathname}_test`;
process.env.DATABASE_URL = url.toString();

// Ephemeral secret per run: the tests do not depend on .env or on CI.
const jwtSecret = randomBytes(48).toString('base64url');

// Same rule as the database: the tests use their own bucket.
const testBucket = `${process.env.S3_BUCKET ?? 'multicooperativa'}-test`;

export default defineConfig({
  test: {
    name: 'api-integration',
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['test/integration-global-setup.ts'],
    env: { DATABASE_URL: url.toString(), JWT_SECRET: jwtSecret, S3_BUCKET: testBucket },
    fileParallelism: false,
  },
});
