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
    // ADR-002: a module only imports from another through its public interface.
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
              message: 'The domain does not import Prisma, the HTTP framework or external SDKs.',
            },
            {
              group: ['**/application/**', '**/infrastructure/**'],
              message: 'The domain does not depend on the application or infrastructure layers.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
