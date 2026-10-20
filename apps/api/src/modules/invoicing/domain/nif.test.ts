import { describe, expect, it } from 'vitest';

import { isValidNif, normalizeNif } from './nif';

describe('NIF validation with check digit (NFR-INV-06)', () => {
  it.each([
    ['12345678Z', 'DNI'],
    ['00000000T', 'DNI'],
    ['X1234567L', 'NIE'],
    ['Y1234567X', 'NIE'],
    ['B12345674', 'company CIF with digit'],
    ['F12345674', 'cooperative CIF'],
    ['F76543214', 'cooperative CIF'],
    ['Q2826000H', 'public body CIF with letter'],
  ])('acepta %s (%s)', (nif) => {
    expect(isValidNif(nif)).toBe(true);
  });

  it.each([
    ['12345678A', 'incorrect DNI letter'],
    ['X1234567A', 'incorrect NIE letter'],
    ['B12345675', 'incorrect CIF digit'],
    ['Q2826000A', 'incorrect CIF letter'],
    ['1234567Z', 'longitud'],
    ['', 'empty'],
    ['ABCDEFGHI', 'formato'],
  ])('rechaza %s (%s)', (nif) => {
    expect(isValidNif(nif)).toBe(false);
  });

  it('normalizes case, spaces and hyphens before validating', () => {
    expect(normalizeNif(' b-1234567 4 ')).toBe('B12345674');
    expect(isValidNif('b-12345674')).toBe(true);
  });
});
