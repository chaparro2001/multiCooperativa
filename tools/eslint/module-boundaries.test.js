import path from 'node:path';

import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import rule from './module-boundaries.js';

RuleTester.describe = describe;
RuleTester.it = it;

const inApi = (...segments) => path.resolve('apps/api/src', ...segments);

new RuleTester().run('module-boundaries', rule, {
  valid: [
    {
      name: 'imports another module through its public interface',
      filename: inApi('modules/announcements/application/publish.ts'),
      code: "import { can } from '../../access';",
    },
    {
      name: 'imports the index.ts of another module explicitly',
      filename: inApi('modules/announcements/application/publish.ts'),
      code: "import { can } from '../../access/index';",
    },
    {
      name: 'imports the inside of its own module',
      filename: inApi('modules/access/application/login.ts'),
      code: "import { User } from '../domain/user';",
    },
    {
      name: 'imports shared code outside modules',
      filename: inApi('modules/access/application/login.ts'),
      code: "import { bus } from '../../../shared/events/bus';",
    },
    {
      name: 'ignores external packages',
      filename: inApi('modules/access/infrastructure/repo.ts'),
      code: "import { z } from 'zod';",
    },
  ],
  invalid: [
    {
      name: 'imports the domain of another module',
      filename: inApi('modules/announcements/application/publish.ts'),
      code: "import { User } from '../../access/domain/user';",
      errors: [{ messageId: 'internalImport', data: { target: 'access' } }],
    },
    {
      name: 're-exports the infrastructure of another module',
      filename: inApi('modules/announcements/index.ts'),
      code: "export * from '../access/infrastructure/repo';",
      errors: [{ messageId: 'internalImport' }],
    },
    {
      name: 'app bootstrap imports the inside of a module',
      filename: inApi('app.ts'),
      code: "import { routes } from './modules/access/infrastructure/http/routes';",
      errors: [{ messageId: 'internalImport' }],
    },
    {
      name: 'dynamic import of the inside of another module',
      filename: inApi('modules/assistant/application/tools.ts'),
      code: "const m = import('../../invoicing/application/list');",
      errors: [{ messageId: 'internalImport' }],
    },
  ],
});
