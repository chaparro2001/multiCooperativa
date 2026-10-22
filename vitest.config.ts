import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Coverage is configured at the root (not per project) and measured by `pnpm test:coverage`.
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.test-d.ts',
        '**/*.d.ts',
        '**/generated/**',
        '**/testing/**',
        '**/fake-*.ts',
        'apps/api/src/dev/**',
      ],
      reporter: ['text-summary', 'html'],
    },
    projects: [
      'apps/api',
      'apps/mobile',
      'packages/contracts',
      {
        test: {
          name: 'tools',
          include: ['tools/**/*.test.js'],
          restoreMocks: true,
          fsModuleCache: true,
        },
      },
    ],
  },
});
