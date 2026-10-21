import { MD3LightTheme, type MD3Theme } from 'react-native-paper';

export const colors = {
  primary: '#1f6f43',
  danger: '#b3261e',
  text: '#1b1b1b',
  muted: '#5f6368',
  border: '#d0d5d9',
  surface: '#f4f6f5',
  dangerContainer: '#fde7e6',
  warning: '#7a5600',
  warningContainer: '#fff4d6',
};

/** Mixes two `#RRGGBB` colours; `amount` is the share of `other` (0 = `base`, 1 = `other`). */
function mix(base: string, other: string, amount: number): string {
  const channel = (hex: string, offset: number) => parseInt(hex.slice(offset, offset + 2), 16);
  const part = (offset: number) =>
    Math.round(channel(base, offset) * (1 - amount) + channel(other, offset) * amount)
      .toString(16)
      .padStart(2, '0');
  return `#${part(1)}${part(3)}${part(5)}`;
}

const WHITE = '#ffffff';
const BLACK = '#000000';

/**
 * Material Design 3 theme for the cooperative's brand colour (ADR-018, ADR-020). The brand is
 * guaranteed to reach 4.5:1 against white (BR-ACC-16), so `onPrimary` is always white. Without branding (`null`) it is the default green. Danger
 * keeps its fixed colour as `error`, so a red brand never makes an error look like a normal action.
 * Screens read it with `useTheme()` from `react-native-paper`.
 */
export function createPaperTheme(brandColor: string | null = null): MD3Theme {
  const brand = brandColor ?? colors.primary;
  const secondary = mix(brand, colors.muted, 0.5);
  const tone = (level: number) => mix(WHITE, brand, level);
  return {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary: brand,
      onPrimary: WHITE,
      primaryContainer: mix(brand, WHITE, 0.85),
      onPrimaryContainer: mix(brand, BLACK, 0.6),
      secondary,
      onSecondary: WHITE,
      // Light brand tint with dark text. Selected chips and segments are painted in the brand by
      // the kit (`src/ui/chip.tsx`), not through this token, which Paper also uses unselected.
      secondaryContainer: mix(brand, WHITE, 0.85),
      onSecondaryContainer: mix(brand, BLACK, 0.6),
      tertiary: secondary,
      onTertiary: WHITE,
      tertiaryContainer: mix(secondary, WHITE, 0.85),
      onTertiaryContainer: mix(secondary, BLACK, 0.6),
      error: colors.danger,
      onError: WHITE,
      errorContainer: colors.dangerContainer,
      onErrorContainer: mix(colors.danger, BLACK, 0.5),
      background: WHITE,
      onBackground: colors.text,
      surface: WHITE,
      onSurface: colors.text,
      surfaceVariant: colors.surface,
      onSurfaceVariant: colors.muted,
      outline: colors.muted,
      outlineVariant: colors.border,
      surfaceDisabled: 'rgba(27, 27, 27, 0.12)',
      onSurfaceDisabled: 'rgba(27, 27, 27, 0.38)',
      elevation: {
        level0: 'transparent',
        level1: tone(0.05),
        level2: tone(0.08),
        level3: tone(0.11),
        level4: tone(0.12),
        level5: tone(0.14),
      },
    },
  };
}
