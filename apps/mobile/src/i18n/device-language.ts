import { getLocales } from 'expo-localization';

import { i18n } from './index';
import { resolveLanguage } from './resources';

/** Switches the app to the device language when it is supported (else it stays on the default). */
export function applyDeviceLanguage(): void {
  const language = resolveLanguage(getLocales()[0]?.languageCode);
  if (i18n.language !== language) void i18n.changeLanguage(language);
}
