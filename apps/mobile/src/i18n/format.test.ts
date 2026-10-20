import { describe, expect, it } from 'vitest';

import { formatDay, formatSize, formatTime, today } from './format';

describe('formatting with the current language', () => {
  it('shows a calendar day in Spanish without a time-zone shift', () => {
    expect(formatDay('2026-03-15')).toBe('15 de marzo de 2026');
  });

  it('shows the time with two digits', () => {
    expect(formatTime(new Date(2026, 2, 15, 9, 5))).toBe('09:05');
  });

  it('shows readable sizes', () => {
    expect(formatSize(500)).toBe('500 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3,5 MB');
  });

  it("gives today's date as YYYY-MM-DD", () => {
    expect(today(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
