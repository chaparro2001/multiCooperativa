import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    restoreMocks: true,
    fsModuleCache: true,
    name: 'contracts',
    include: ['src/**/*.test.ts'],
    // Type-level tests (expectTypeOf) run through tsc, only in this project.
    typecheck: { enabled: true, include: ['**/*.test-d.ts'] },
  },
});
