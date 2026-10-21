import { describe, expect, it } from 'vitest';

import { badgeText } from './badge-count';

describe('badgeText (home tile badges)', () => {
  it('shows nothing for zero, negatives and non-numbers', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-3)).toBeNull();
    expect(badgeText(Number.NaN)).toBeNull();
  });

  it('shows the number up to 99 and caps above it', () => {
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
    expect(badgeText(1234)).toBe('99+');
  });
});
