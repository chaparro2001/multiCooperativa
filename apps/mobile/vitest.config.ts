import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'mobile',
    // Lógica pura. Los tests de componentes (*.test.tsx) usarán React Native Testing Library.
    include: ['src/**/*.test.ts'],
  },
});
