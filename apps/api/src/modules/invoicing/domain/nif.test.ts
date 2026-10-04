import { describe, expect, it } from 'vitest';

import { isValidNif, normalizeNif } from './nif';

describe('validación de NIF con dígito de control (RNF-FAC-06)', () => {
  it.each([
    ['12345678Z', 'DNI'],
    ['00000000T', 'DNI'],
    ['X1234567L', 'NIE'],
    ['Y1234567X', 'NIE'],
    ['B12345674', 'CIF de sociedad con dígito'],
    ['F12345674', 'CIF de cooperativa'],
    ['F76543214', 'CIF de cooperativa'],
    ['Q2826000H', 'CIF de organismo con letra'],
  ])('acepta %s (%s)', (nif) => {
    expect(isValidNif(nif)).toBe(true);
  });

  it.each([
    ['12345678A', 'letra de DNI incorrecta'],
    ['X1234567A', 'letra de NIE incorrecta'],
    ['B12345675', 'dígito de CIF incorrecto'],
    ['Q2826000A', 'letra de CIF incorrecta'],
    ['1234567Z', 'longitud'],
    ['', 'vacío'],
    ['ABCDEFGHI', 'formato'],
  ])('rechaza %s (%s)', (nif) => {
    expect(isValidNif(nif)).toBe(false);
  });

  it('normaliza mayúsculas, espacios y guiones antes de validar', () => {
    expect(normalizeNif(' b-1234567 4 ')).toBe('B12345674');
    expect(isValidNif('b-12345674')).toBe(true);
  });
});
