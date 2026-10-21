import type { Module } from '@multicooperativa/contracts';

/** BR-ACC-16: white text on the primary colour must reach WCAG AA. The API is the authority; this is for feedback. */
export const MIN_CONTRAST = 4.5;

/** Ready-made colours that all pass the contrast rule (checked in the tests). */
export const PRESET_COLORS = [
  '#1F6F43',
  '#1E5AA8',
  '#0F766E',
  '#6D28D9',
  '#9D174D',
  '#B45309',
  '#B91C1C',
  '#374151',
] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** What the user typed as `#RRGGBB` in upper case, adding the `#` if missing; null if it is not a colour. */
export function parseHexColor(input: string): string | null {
  const text = input.trim();
  const withHash = text.startsWith('#') ? text : `#${text}`;
  return HEX_COLOR.test(withHash) ? withHash.toUpperCase() : null;
}

function channel(hex: string): number {
  const value = parseInt(hex, 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG contrast ratio of white text over a `#RRGGBB` colour. */
export function contrastWithWhite(color: string): number {
  const luminance =
    0.2126 * channel(color.slice(1, 3)) +
    0.7152 * channel(color.slice(3, 5)) +
    0.0722 * channel(color.slice(5, 7));
  return 1.05 / (luminance + 0.05);
}

/**
 * US-ACC-14: the section is shown to whoever administers the cooperative: the users module at
 * "manage" level. It only hides; the API answers 403 to anyone else (ADR-004).
 */
export function canEditBranding(
  permissions: readonly { module: Module; level: string }[] | undefined,
): boolean {
  return permissions?.some((p) => p.module === 'users' && p.level === 'manage') ?? false;
}
