import es from './locales/es.json';

/**
 * Adding a language: drop `locales/<code>.json` next to `es.json` (same keys), import it here,
 * add it to `resources`, and map it to a BCP 47 locale in `INTL_LOCALES`.
 */
export const resources = {
  es: { translation: es },
} as const;

export type Language = keyof typeof resources;

export const SUPPORTED_LANGUAGES = Object.keys(resources) as Language[];

/** Default and fallback language: every text exists in it. */
export const DEFAULT_LANGUAGE: Language = 'es';

/** Locale handed to `Intl` for each language (dates, numbers). */
export const INTL_LOCALES: Record<Language, string> = {
  es: 'es-ES',
};

/** The supported language for a device language code such as "es" or "es-ES"; else the default. */
export function resolveLanguage(code: string | null | undefined): Language {
  const base = code?.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.find((language) => language === base) ?? DEFAULT_LANGUAGE;
}
