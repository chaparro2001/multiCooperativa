import { describe, expect, it } from 'vitest';

import { acceptInvitationRequestSchema, loginRequestSchema } from './auth';

describe('contratos de autenticación', () => {
  it('el login exige email y contraseña', () => {
    expect(loginRequestSchema.safeParse({ email: 'ada@campo.es' }).success).toBe(false);
    expect(
      loginRequestSchema.parse({ email: ' ada@campo.es ', password: 'una-clave-larga' }),
    ).toEqual({ email: 'ada@campo.es', password: 'una-clave-larga' });
  });

  it('rechaza contraseñas desmesuradas', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'ada@campo.es', password: 'x'.repeat(257) }).success,
    ).toBe(false);
  });

  it('la contraseña es opcional al aceptar una invitación', () => {
    expect(acceptInvitationRequestSchema.parse({ token: 'abc' })).toEqual({ token: 'abc' });
  });
});
