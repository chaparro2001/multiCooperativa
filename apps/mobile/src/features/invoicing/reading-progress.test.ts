import { describe, expect, it } from 'vitest';

import { readingProgress } from './reading-progress';

describe('readingProgress', () => {
  it('starts at 0 on the first step', () => {
    expect(readingProgress(0)).toEqual({ percent: 0, current: 0 });
  });

  it('advances the steps with time', () => {
    expect(readingProgress(3).current).toBe(1);
    expect(readingProgress(6).current).toBe(2);
  });

  it('grows but never reaches 100 %', () => {
    expect(readingProgress(10).percent).toBeGreaterThan(readingProgress(2).percent);
    expect(readingProgress(10_000).percent).toBeLessThanOrEqual(90);
  });

  it('ignores negative and invalid values', () => {
    expect(readingProgress(-5)).toEqual({ percent: 0, current: 0 });
    expect(readingProgress(Number.NaN)).toEqual({ percent: 0, current: 0 });
  });
});
