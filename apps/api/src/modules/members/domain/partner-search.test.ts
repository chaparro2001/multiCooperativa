import { describe, expect, it } from 'vitest';

import { matchesPartner } from './partner-search';

const ana = { name: 'Ana García Pérez', partnerNumber: '003', email: 'ana@coop.test' };

describe('US-MEM-05 · which partner a question names', () => {
  it.each(['ana', 'GARCÍA', 'garcia perez', 'ana@coop'])('matches the name or email "%s"', (q) => {
    expect(matchesPartner(ana, q)).toBe(true);
  });

  it.each(['3', '003', ' 3 '])('matches the partner number "%s" ignoring leading zeros', (q) => {
    expect(matchesPartner(ana, q)).toBe(true);
  });

  it.each(['', '  ', 'Benito', '30', '03x'])('does not match "%s"', (q) => {
    expect(matchesPartner(ana, q)).toBe(false);
  });
});
