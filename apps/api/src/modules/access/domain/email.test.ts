import { describe, expect, it } from 'vitest';

import { normalizeEmail } from './email';

describe('normalizeEmail (RN-ACC-01)', () => {
  it('ignora mayúsculas y espacios para que el email identifique a un único usuario', () => {
    expect(normalizeEmail('  Ana.Garcia@Example.COM ')).toBe('ana.garcia@example.com');
  });
});
