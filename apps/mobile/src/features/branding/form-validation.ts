import { collect, type FieldErrors, required } from '@/forms/errors';
import type { ServerMapping } from '@/forms/server-errors';

import { contrastWithWhite, MIN_CONTRAST, parseHexColor } from './brand-color';

export const BRAND_FIELDS = ['color'] as const;

/** BR-ACC-16: a colour the API refuses is marked on the colour field, with the ratio it measured. */
export const BRAND_SERVER_MAPPING: ServerMapping = {
  codes: { insufficient_contrast: 'color', invalid_color: 'color' },
};

/** Same format as the text the server shows, with the ratio formatted by the caller's locale. */
const ratioText = (ratio: number, locale: string) =>
  ratio.toLocaleString(locale, { maximumFractionDigits: 2 });

/**
 * US-ACC-14, BR-ACC-16: the colour must be `#RRGGBB` and white text on it must reach WCAG AA
 * (the API checks again and is the authority).
 */
export function validateBrandColor(values: { color: string }, locale = 'es'): FieldErrors {
  const text = values.color.trim();
  if (!text) return collect({ color: required });
  const color = parseHexColor(text);
  if (!color) return collect({ color: { key: 'errors.codes.invalid_color' } });
  const ratio = contrastWithWhite(color);
  return collect({
    color:
      ratio < MIN_CONTRAST
        ? {
            key: 'errors.codes.insufficient_contrast',
            params: { ratio: ratioText(ratio, locale), minimum: ratioText(MIN_CONTRAST, locale) },
          }
        : undefined,
  });
}
