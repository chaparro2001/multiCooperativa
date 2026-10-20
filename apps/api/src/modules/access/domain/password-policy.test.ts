import { describe, expect, it } from 'vitest';

import { WeakPasswordError } from './errors';
import { assertPasswordPolicy } from './password-policy';

describe('password policy (NFR-ACC-01)', () => {
  it('accepts a 10-character password', () => {
    expect(() => assertPasswordPolicy('abcdefghij')).not.toThrow();
  });

  it('rejects a 9-character password', () => {
    expect(() => assertPasswordPolicy('abcdefghi')).toThrow(WeakPasswordError);
  });
});
