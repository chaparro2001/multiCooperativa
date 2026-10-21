/** WCAG AA for normal text (BR-ACC-16). */
export const MIN_CONTRAST = 4.5;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** `#RRGGBB` in upper case, or null when it is not one. */
export function normalizeBrandColor(value: string): string | null {
  return HEX_COLOR.test(value) ? value.toUpperCase() : null;
}

function channel(hex: string): number {
  const value = parseInt(hex, 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
function luminance(color: string): number {
  return (
    0.2126 * channel(color.slice(1, 3)) +
    0.7152 * channel(color.slice(3, 5)) +
    0.0722 * channel(color.slice(5, 7))
  );
}

/** Contrast ratio of white text over the colour: (1 + 0.05) / (L + 0.05). */
export function contrastWithWhite(color: string): number {
  return 1.05 / (luminance(color) + 0.05);
}
