import { describe, expect, it } from 'vitest';

import { requiredTermMatches } from './term-coverage';

describe('term coverage of the text arm (US-DOC-07, ADR-022)', () => {
  it.each([
    [0, 0],
    [1, 1], // "quórum"
    [2, 2], // "artículo 14"
    [3, 2], // "edad mínima para ser socio"
    [4, 2],
    [5, 3],
    [8, 4],
  ])('Given a query with %i lexemes, then a fragment needs %i of them', (lexemes, required) => {
    expect(requiredTermMatches(lexemes)).toBe(required);
  });
});
