import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'api',
    include: ['src/**/*.test.ts'],
    // Los tests de integración necesitan PostgreSQL: se lanzan con `pnpm test:integration`.
    exclude: ['src/**/*.integration.test.ts'],
  },
});
