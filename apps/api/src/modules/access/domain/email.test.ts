import { describe, expect, it } from 'vitest';

import { normalizeEmail } from './email';

describe('normalizeEmail (BR-ACC-01)', () => {
  it('ignores case and spaces so that the email identifies a single user', () => {
    expect(normalizeEmail('  Ana.Garcia@Example.COM ')).toBe('ana.garcia@example.com');
  });
});
