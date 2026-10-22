import { describe, expect, it, vi } from 'vitest';

import { contrastWithWhite, MIN_CONTRAST, PRESET_COLORS } from '@/features/branding/brand-color';

import {
  colors,
  createPaperTheme,
  focusRing,
  layout,
  radius,
  scrim,
  shadow,
  size,
  space,
} from './theme';

// Values copied from docs/design-system/tokens.json (not read from docs/, so the app does not depend on it).
const PRESET_TOKENS = [
  [
    'green',
    '#1f6f43',
    {
      primaryContainer: '#dde9e3',
      onPrimaryContainer: '#0c2c1b',
      secondary: '#3f6956',
      elevation: ['#f4f8f6', '#edf3f0', '#e6efea', '#e4eee8', '#e0ebe5'],
    },
  ],
  [
    'blue',
    '#1e5aa8',
    {
      primaryContainer: '#dde6f2',
      onPrimaryContainer: '#0c2443',
      secondary: '#3f5f88',
      elevation: ['#f4f7fb', '#edf2f8', '#e6edf5', '#e4ebf5', '#dfe8f3'],
    },
  ],
  [
    'teal',
    '#0f766e',
    {
      primaryContainer: '#dbeae9',
      onPrimaryContainer: '#062f2c',
      secondary: '#376d6b',
      elevation: ['#f3f8f8', '#ecf4f3', '#e5f0ef', '#e2efee', '#ddeceb'],
    },
  ],
  [
    'violet',
    '#6d28d9',
    {
      primaryContainer: '#e9dff9',
      onPrimaryContainer: '#2c1057',
      secondary: '#6646a1',
      elevation: ['#f8f4fd', '#f3eefc', '#efe7fb', '#ede5fa', '#ebe1fa'],
    },
  ],
  [
    'wine',
    '#9d174d',
    {
      primaryContainer: '#f0dce4',
      onPrimaryContainer: '#3f091f',
      secondary: '#7e3d5b',
      elevation: ['#faf3f6', '#f7ecf1', '#f4e5eb', '#f3e3ea', '#f1dfe6'],
    },
  ],
  [
    'amber',
    '#b45309',
    {
      primaryContainer: '#f4e5da',
      onPrimaryContainer: '#482104',
      secondary: '#8a5b39',
      elevation: ['#fbf6f3', '#f9f1eb', '#f7ece4', '#f6eae1', '#f5e7dd'],
    },
  ],
  [
    'red',
    '#b91c1c',
    {
      primaryContainer: '#f5dddd',
      onPrimaryContainer: '#4a0b0b',
      secondary: '#8c4042',
      elevation: ['#fcf4f4', '#f9eded', '#f7e6e6', '#f7e4e4', '#f5dfdf'],
    },
  ],
  [
    'slate',
    '#374151',
    {
      primaryContainer: '#e1e3e5',
      onPrimaryContainer: '#161a20',
      secondary: '#4b525d',
      elevation: ['#f5f6f6', '#eff0f1', '#e9eaec', '#e7e8ea', '#e3e4e7'],
    },
  ],
] as const;

// Paper pulls in react-native, which does not load in Node: only the base tokens are needed here.
vi.mock('react-native-paper', () => ({ MD3LightTheme: { colors: {} } }));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('Paper theme from the brand colour (ADR-018, ADR-020)', () => {
  it('uses the cooperative colour as the primary colour (ADR-018)', () => {
    const theme = createPaperTheme('#1a4f9c');
    expect(theme.colors.primary).toBe('#1a4f9c');
    expect(theme.colors.onPrimary).toBe('#ffffff');
  });

  it('falls back to the default green without branding (ADR-018)', () => {
    expect(createPaperTheme(null).colors.primary).toBe(colors.primary);
    expect(createPaperTheme().colors.primary).toBe(colors.primary);
  });

  it.each(['#b3261e', '#c0392b', '#8b0000'])(
    'keeps danger fixed as error even with a red brand %s (ADR-018)',
    (brand) => {
      const theme = createPaperTheme(brand);
      expect(theme.colors.error).toBe(colors.danger);
      expect(theme.colors.errorContainer).toBe(colors.dangerContainer);
      expect(theme.colors.primary).toBe(brand);
    },
  );

  it('keeps the warning colours independent of the brand (ADR-018)', () => {
    expect(colors.warning).toBe('#7a5600');
    expect(colors.warningContainer).toBe('#fff4d6');
    expect(createPaperTheme('#1a4f9c').colors.error).not.toBe(
      createPaperTheme('#1a4f9c').colors.primary,
    );
  });

  it.each([...PRESET_COLORS, '#1a4f9c'])(
    'keeps unselected chips a light tint with readable text, not the brand %s (ADR-018)',
    (brand) => {
      const theme = createPaperTheme(brand);
      expect(theme.colors.secondaryContainer).not.toBe(brand);
      expect(
        contrast(theme.colors.onSecondaryContainer, theme.colors.secondaryContainer),
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    },
  );

  it.each([...PRESET_COLORS, '#1a4f9c'])(
    'has white text readable on the brand %s that fills selected chips and segments (ADR-018)',
    (brand) => {
      const theme = createPaperTheme(brand);
      expect(theme.colors.onPrimary).toBe('#ffffff');
      expect(contrastWithWhite(theme.colors.primary)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    },
  );
});

describe('design tokens (ADR-024)', () => {
  it.each(PRESET_TOKENS)(
    'derives the tones of the %s preset like tokens.json',
    (_id, brand, expected) => {
      const theme = createPaperTheme(brand);
      expect(theme.colors.primaryContainer).toBe(expected.primaryContainer);
      expect(theme.colors.onPrimaryContainer).toBe(expected.onPrimaryContainer);
      expect(theme.colors.secondary).toBe(expected.secondary);
      expect([1, 2, 3, 4, 5].map((n) => theme.colors.elevation[`level${n}` as 'level1'])).toEqual(
        expected.elevation,
      );
    },
  );

  it.each(PRESET_TOKENS)('keeps the documented contrast in the %s preset', (_id, brand) => {
    const theme = createPaperTheme(brand);
    expect(
      contrast(theme.colors.onPrimaryContainer, theme.colors.primaryContainer),
    ).toBeGreaterThanOrEqual(11);
    expect(contrast(theme.colors.primary, theme.colors.background)).toBeGreaterThanOrEqual(5);
  });

  it('exposes the scrim as the theme backdrop', () => {
    expect(scrim).toBe('rgba(27, 27, 27, 0.32)');
    expect(createPaperTheme(null).colors.backdrop).toBe(scrim);
  });

  it('keeps the spacing scale on the 4-pt grid', () => {
    expect(Object.values(space).every((value) => value % 4 === 0)).toBe(true);
    expect(space[6]).toBe(24);
    expect(layout.maxWidth).toBe(960);
  });

  it('keeps the radii, sizes and shadows of tokens.json', () => {
    expect(radius).toEqual({ xs: 4, sm: 8, md: 12, bubble: 14, lg: 16, full: 999 });
    expect(size.control).toBe(48);
    expect(size.badge).toBe(22);
    expect(Object.keys(shadow)).toEqual(['1', '2', '3']);
  });

  it('draws the web focus ring as a 2 px solid ring offset by 2', () => {
    expect(focusRing('#1f6f43')).toEqual({
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineColor: '#1f6f43',
      outlineOffset: 2,
    });
  });

  it('names the grey app surface surfaceVariant', () => {
    expect(colors.surfaceVariant).toBe('#f4f6f5');
    expect(createPaperTheme(null).colors.surfaceVariant).toBe(colors.surfaceVariant);
  });
});
