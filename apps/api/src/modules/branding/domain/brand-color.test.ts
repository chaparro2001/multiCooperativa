import { describe, expect, it } from 'vitest';

import { contrastWithWhite, MIN_CONTRAST, normalizeBrandColor } from './brand-color';

/** BR-ACC-16: white text on the primary colour must reach WCAG AA (4.5:1). */
describe('contrastWithWhite (BR-ACC-16)', () => {
  it.each([
    ['#000000', 21],
    ['#FFFFFF', 1],
    ['#767676', 4.54], // the lightest grey that passes AA on white
    ['#777777', 4.48],
    ['#FFE066', 1.3],
  ])('%s has %f:1', (color, expected) => {
    expect(contrastWithWhite(color)).toBeCloseTo(expected, 1);
  });

  it('is case-insensitive', () => {
    expect(contrastWithWhite('#1e5aa8')).toBe(contrastWithWhite('#1E5AA8'));
  });

  it('accepts a blue that reads well and draws the line at 4.5', () => {
    expect(contrastWithWhite('#1E5AA8')).toBeGreaterThan(MIN_CONTRAST);
    expect(contrastWithWhite('#767676')).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastWithWhite('#777777')).toBeLessThan(MIN_CONTRAST);
  });
});

describe('normalizeBrandColor', () => {
  it('upper-cases a #RRGGBB colour', () => {
    expect(normalizeBrandColor('#1e5aa8')).toBe('#1E5AA8');
  });

  it.each(['1E5AA8', '#1E5', '#1E5AA8FF', '#GGGGGG', 'red', '', ' #1E5AA8'])(
    'rejects %j',
    (value) => {
      expect(normalizeBrandColor(value)).toBeNull();
    },
  );
});
