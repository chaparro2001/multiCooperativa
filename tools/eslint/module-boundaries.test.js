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
      name: 'importa otro módulo por su interfaz pública',
      filename: inApi('modules/comunicados/application/publish.ts'),
      code: "import { can } from '../../acceso';",
    },
    {
      name: 'importa el index.ts de otro módulo de forma explícita',
      filename: inApi('modules/comunicados/application/publish.ts'),
      code: "import { can } from '../../acceso/index';",
    },
    {
      name: 'importa el interior de su propio módulo',
      filename: inApi('modules/acceso/application/login.ts'),
      code: "import { User } from '../domain/user';",
    },
    {
      name: 'importa código compartido fuera de modules',
      filename: inApi('modules/acceso/application/login.ts'),
      code: "import { bus } from '../../../shared/events/bus';",
    },
    {
      name: 'ignora los paquetes externos',
      filename: inApi('modules/acceso/infrastructure/repo.ts'),
      code: "import { z } from 'zod';",
    },
  ],
  invalid: [
    {
      name: 'importa el dominio de otro módulo',
      filename: inApi('modules/comunicados/application/publish.ts'),
      code: "import { User } from '../../acceso/domain/user';",
      errors: [{ messageId: 'internalImport', data: { target: 'acceso' } }],
    },
    {
      name: 'reexporta la infraestructura de otro módulo',
      filename: inApi('modules/comunicados/index.ts'),
      code: "export * from '../acceso/infrastructure/repo';",
      errors: [{ messageId: 'internalImport' }],
    },
    {
      name: 'el arranque de la app importa el interior de un módulo',
      filename: inApi('app.ts'),
      code: "import { routes } from './modules/acceso/infrastructure/http/routes';",
      errors: [{ messageId: 'internalImport' }],
    },
    {
      name: 'import dinámico del interior de otro módulo',
      filename: inApi('modules/asistente/application/tools.ts'),
      code: "const m = import('../../facturacion/application/list');",
      errors: [{ messageId: 'internalImport' }],
    },
  ],
});
