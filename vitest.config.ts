import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/api',
      'packages/contracts',
      { test: { name: 'tools', include: ['tools/**/*.test.js'] } },
    ],
  },
});
