import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_LANGUAGE, resources, SUPPORTED_LANGUAGES } from './resources';

// Resources are bundled, so initialization is synchronous: texts are available right after import
// (components, helpers outside React and tests alike).
void i18next.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export const i18n = i18next;
export const t = i18next.t.bind(i18next);
