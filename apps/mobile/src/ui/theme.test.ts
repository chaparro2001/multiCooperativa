import { describe, expect, it, vi } from 'vitest';

import { contrastWithWhite, MIN_CONTRAST, PRESET_COLORS } from '@/features/branding/brand-color';

import { colors, createPaperTheme } from './theme';

// Paper pulls in react-native, which does not load in Node: only the base tokens are needed here.
vi.mock('react-native-paper', () => ({ MD3LightTheme: { colors: {} } }));

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
    'paints selected chips and segmented options in the brand %s with readable text (ADR-018)',
    (brand) => {
      const theme = createPaperTheme(brand);
      expect(theme.colors.secondaryContainer).toBe(brand);
      expect(theme.colors.onSecondaryContainer).toBe('#ffffff');
      expect(contrastWithWhite(theme.colors.secondaryContainer)).toBeGreaterThanOrEqual(
        MIN_CONTRAST,
      );
    },
  );
});
