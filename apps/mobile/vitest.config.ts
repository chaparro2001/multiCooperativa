import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'lucide-react-native': fileURLToPath(new URL('./test/lucide-stub.ts', import.meta.url)),
    },
  },
  test: {
    name: 'mobile',
    // Pure logic. Component tests (*.test.tsx) will use React Native Testing Library.
    include: ['src/**/*.test.ts'],
  },
});
