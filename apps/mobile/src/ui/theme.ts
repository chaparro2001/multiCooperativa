import type { ViewStyle } from 'react-native';
import { MD3LightTheme, type MD3Theme } from 'react-native-paper';

export const colors = {
  primary: '#1f6f43',
  danger: '#b3261e',
  text: '#1b1b1b',
  muted: '#5f6368',
  border: '#d0d5d9',
  surfaceVariant: '#f4f6f5',
  dangerContainer: '#fde7e6',
  warning: '#7a5600',
  warningContainer: '#fff4d6',
};

/** Backdrop behind menus and the biometric-lock overlay: `text` at 32 % (`scrim` in tokens.json). */
export const scrim = 'rgba(27, 27, 27, 0.32)';

/** 4-pt spacing scale (`space-n` in tokens.json). Screen padding is `space[6]`. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

/** Corner radii (`radius-*`). Paper's roundness 4 already gives `xs`, `sm`, `md` and pill buttons. */
export const radius = { xs: 4, sm: 8, md: 12, bubble: 14, lg: 16, full: 999 } as const;

/** Fixed dimensions the design enforces (`size-*`). */
export const size = {
  control: 48,
  field: 56,
  headerIcon: 44,
  icon: 24,
  iconTile: 40,
  iconEmpty: 48,
  badge: 22,
  countBadge: 20,
  chip: 32,
  composerMax: 120,
} as const;

/** MD3 shadows as React Native `boxShadow` strings (also valid on react-native-web). */
export const shadow = {
  1: '0 1px 2px #1b1b1b1f, 0 1px 3px 1px #1b1b1b14',
  2: '0 1px 2px #1b1b1b26, 0 2px 6px 2px #1b1b1b14',
  3: '0 4px 8px 3px #1b1b1b14, 0 1px 3px #1b1b1b26',
} as const;

/** Layout constants (`layout-*`). */
export const layout = { maxWidth: 960, phone: 390, bubbleMax: '92%' } as const;

/**
 * Keyboard focus ring for the web build: a solid 2 px ring in the given colour, 2 px outside the
 * control. Apply it only on web (`Platform.OS === 'web'`); native ignores outlines.
 */
export function focusRing(color: string): ViewStyle {
  return { outlineStyle: 'solid', outlineWidth: 2, outlineColor: color, outlineOffset: 2 };
}

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
      surfaceVariant: colors.surfaceVariant,
      onSurfaceVariant: colors.muted,
      outline: colors.muted,
      outlineVariant: colors.border,
      backdrop: scrim,
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
