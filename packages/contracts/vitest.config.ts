import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    restoreMocks: true,
    fsModuleCache: true,
    name: 'contracts',
    include: ['src/**/*.test.ts'],
  },
});
