import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    restoreMocks: true,
    fsModuleCache: true,
    name: 'mobile',
    // Pure logic only (*.test.ts). There are no component tests yet; React Native Testing Library is planned, not delivered.
    include: ['src/**/*.test.ts'],
  },
});
