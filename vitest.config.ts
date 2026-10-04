import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/api',
      'apps/mobile',
      'packages/contracts',
      { test: { name: 'tools', include: ['tools/**/*.test.js'] } },
    ],
  },
});
