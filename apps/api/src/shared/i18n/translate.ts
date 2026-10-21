import { DEFAULT_LOCALE, type Locale, LOCALES, type MessageKey, MESSAGES } from './messages';

export type MessageParams = Record<string, string | number>;

/** True if `value` is one of the supported locales. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Server-side user-facing text. `locale` defaults to Spanish. Every `{name}`
 * placeholder is replaced from `params`; a placeholder without a value is left
 * untouched so the gap is visible instead of silently empty.
 */
export function translate(
  locale: Locale = DEFAULT_LOCALE,
  key: MessageKey,
  params: MessageParams = {},
): string {
  return MESSAGES[locale][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

const INTL_LOCALE: Record<Locale, string> = { es: 'es-ES', en: 'en-GB' };

/** Server-written dates for the members, in the cooperatives' time zone (Spain). */
export function formatDateTime(locale: Locale = DEFAULT_LOCALE, date: Date): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(date);
}
