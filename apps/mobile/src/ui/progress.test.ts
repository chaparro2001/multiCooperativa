import { describe, expect, it } from 'vitest';

import { clampMark, percent, ratio, tallyShares } from './progress';

describe('progress helpers', () => {
  it.each([
    [42, 120, 0.35],
    [0, 10, 0],
    [5, 0, 0],
    [15, 10, 1],
    [-3, 10, 0],
    [Number.NaN, 10, 0],
  ])('ratio(%s, %s) = %s', (value, total, expected) => {
    expect(ratio(value, total)).toBeCloseTo(expected);
  });

  it('rounds the written percentage', () => {
    expect(percent(42, 120)).toBe(35);
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
  });

  it.each([
    [0.5, 0.5],
    [-1, 0],
    [2, 1],
    [null, null],
    [undefined, null],
    [Number.NaN, null],
  ])('clampMark(%s) = %s', (mark, expected) => {
    expect(clampMark(mark)).toBe(expected);
  });

  it('shares a tally among the votes counted (BR-ASM-11 data)', () => {
    expect(tallyShares({ favor: 6, against: 3, abstentions: 1 })).toEqual([
      { key: 'favor', count: 6, share: 0.6 },
      { key: 'against', count: 3, share: 0.3 },
      { key: 'abstentions', count: 1, share: 0.1 },
    ]);
  });

  it('gives empty bars while nobody has voted', () => {
    expect(tallyShares({ favor: 0, against: 0, abstentions: 0 }).map((row) => row.share)).toEqual([
      0, 0, 0,
    ]);
  });
});
