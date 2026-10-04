import { describe, expect, it } from 'vitest';

import { WeakPasswordError } from './errors';
import { assertPasswordPolicy } from './password-policy';

describe('política de contraseñas (RNF-ACC-01)', () => {
  it('acepta una contraseña de 10 caracteres', () => {
    expect(() => assertPasswordPolicy('abcdefghij')).not.toThrow();
  });

  it('rechaza una contraseña de 9 caracteres', () => {
    expect(() => assertPasswordPolicy('abcdefghi')).toThrow(WeakPasswordError);
  });
});
