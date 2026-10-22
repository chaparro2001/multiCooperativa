import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import moduleBoundaries from './tools/eslint/module-boundaries.js';

/** Packages a pure layer must not import: the ORM, the HTTP framework and every external SDK. */
const SDK_PACKAGES = [
  '@prisma/*',
  'prisma',
  'express',
  'express/*',
  'express-rate-limit',
  '@anthropic-ai/*',
  '@sentry/*',
  '@aws-sdk/*',
  '@google/genai',
  'jose',
  'multer',
  'pg',
  '@node-rs/argon2',
  'pdf-lib',
  'unpdf',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/generated/**',
      '.claude/**',
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
    // Pure domain: no Prisma, HTTP framework, external SDKs or outer layers.
    files: ['apps/api/src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: SDK_PACKAGES,
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
  {
    // Application layer: use cases talk to ports, never to the framework, SDKs or adapters.
    files: ['apps/api/src/modules/*/application/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: SDK_PACKAGES,
              message:
                'The application layer does not import Prisma, the HTTP framework or external SDKs: use a port.',
            },
            {
              group: ['**/infrastructure/**'],
              message: 'The application layer does not depend on infrastructure: define a port.',
            },
          ],
        },
      ],
    },
  },
  {
    // Rules of Hooks + React Compiler rules (app.json enables `reactCompiler`): code the compiler
    // cannot optimise safely is flagged here instead of silently skipped.
    ...reactHooks.configs.flat.recommended,
    files: ['apps/mobile/**/*.{ts,tsx}'],
  },
  prettier,
);
