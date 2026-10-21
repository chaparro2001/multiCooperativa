import { describe, expect, it } from 'vitest';

import {
  canEditBranding,
  contrastWithWhite,
  MIN_CONTRAST,
  parseHexColor,
  PRESET_COLORS,
} from './brand-color';

describe('contrastWithWhite (BR-ACC-16)', () => {
  it.each([
    ['#000000', 21],
    ['#FFFFFF', 1],
    ['#767676', 4.54],
    ['#777777', 4.48],
    ['#FFE066', 1.3],
  ])('%s has %f:1', (color, expected) => {
    expect(contrastWithWhite(color)).toBeCloseTo(expected, 1);
  });

  it('keeps every preset readable under white text', () => {
    for (const color of PRESET_COLORS) {
      expect(contrastWithWhite(color), color).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe('parseHexColor', () => {
  it.each([
    ['#1e5aa8', '#1E5AA8'],
    ['1e5aa8', '#1E5AA8'],
    ['  #1E5AA8 ', '#1E5AA8'],
  ])('reads %j as %s', (input, expected) => {
    expect(parseHexColor(input)).toBe(expected);
  });

  it.each(['', '#', '#12345', '#1234567', '#GGGGGG', 'blue'])('rejects %j', (input) => {
    expect(parseHexColor(input)).toBeNull();
  });
});

describe('canEditBranding (US-ACC-14)', () => {
  it('is for the users module at manage level only', () => {
    expect(canEditBranding([{ module: 'users', level: 'manage' }])).toBe(true);
    expect(canEditBranding([{ module: 'users', level: 'read' }])).toBe(false);
    expect(canEditBranding([{ module: 'documents', level: 'manage' }])).toBe(false);
    expect(canEditBranding(undefined)).toBe(false);
  });
});
