import { describe, expect, it } from 'vitest';

import { normalizeDecimal } from './decimal-text';

describe('normalizing amounts read from a document', () => {
  it.each([
    ['1234.56', '1234.56'],
    ['1.234,56', '1234.56'],
    ['1,234.56', '1234.56'],
    ['1 234,56 €', '1234.56'],
    ['21%', '21'],
    ['0,5', '0.5'],
    ['1.250,500', '1250.500'],
    ['-12,30', '-12.30'],
    ['1.234', '1234'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDecimal(input)).toBe(expected);
  });

  it.each(['', 'abc', '12,34,56', '1.2.3,4', null])('%s is not a number', (input) => {
    expect(normalizeDecimal(input)).toBeNull();
  });
});
