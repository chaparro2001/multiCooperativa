import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    restoreMocks: true,
    fsModuleCache: true,
    name: 'api',
    include: ['src/**/*.test.ts'],
    // Integration tests need PostgreSQL: run them with `pnpm test:integration`.
    exclude: ['src/**/*.integration.test.ts'],
  },
});
