import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import moduleBoundaries from './tools/eslint/module-boundaries.js';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      // `{ secret: _secret, ...rest }` drops fields; `_next` keeps Express error handlers at 4 params.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { ignoreRestSiblings: true, argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // ADR-002: un módulo solo importa de otro a través de su interfaz pública.
    files: ['apps/api/**/*.ts'],
    plugins: { local: { rules: { 'module-boundaries': moduleBoundaries } } },
    rules: { 'local/module-boundaries': 'error' },
  },
  {
    // Dominio puro: sin Prisma, framework HTTP, SDK externos ni capas exteriores.
    files: ['apps/api/src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@prisma/*',
                'prisma',
                'express',
                'express/*',
                '@anthropic-ai/*',
                '@sentry/*',
              ],
              message: 'El dominio no importa Prisma, el framework HTTP ni SDK externos.',
            },
            {
              group: ['**/application/**', '**/infrastructure/**'],
              message: 'El dominio no depende de las capas de aplicación ni de infraestructura.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
