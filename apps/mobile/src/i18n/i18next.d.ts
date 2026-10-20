import 'i18next';

import type { resources } from './resources';

// Makes `t('some.key')` check the key against the default catalog (es.json).
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['es'];
  }
}
