import { describe, expect, it } from 'vitest';

import { fromInputValue, toInputValue } from './web-date-input';

describe('web date input values', () => {
  it('formats local dates and date-times without time zone shifts', () => {
    const date = new Date(2026, 9, 5, 9, 7);
    expect(toInputValue(date, 'date')).toBe('2026-10-05');
    expect(toInputValue(date, 'datetime')).toBe('2026-10-05T09:07');
  });

  it('parses what it formats', () => {
    const date = new Date(2026, 0, 31, 23, 55);
    expect(fromInputValue(toInputValue(date, 'datetime'), 'datetime')).toEqual(date);
    expect(fromInputValue('2026-01-31', 'date')).toEqual(new Date(2026, 0, 31));
  });

  it('returns null for empty or incomplete values', () => {
    expect(fromInputValue('', 'date')).toBeNull();
    expect(fromInputValue('2026-01-31', 'datetime')).toBeNull();
    expect(fromInputValue('nonsense', 'date')).toBeNull();
  });
});
