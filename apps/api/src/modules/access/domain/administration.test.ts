import { describe, expect, it } from 'vitest';

import { assertKeepsAnAdmin, assertNotSelf } from './administration';
import { LastAdminError, SelfModificationError } from './errors';

describe('assertNotSelf (RN-ACC-08)', () => {
  it('rechaza que un administrador modifique su propia membresía', () => {
    expect(() => assertNotSelf('m-1', 'm-1')).toThrow(SelfModificationError);
  });

  it('permite modificar la membresía de otro miembro', () => {
    expect(() => assertNotSelf('m-1', 'm-2')).not.toThrow();
  });
});

describe('assertKeepsAnAdmin (RN-ACC-07)', () => {
  it('rechaza retirar al último administrador activo', () => {
    expect(() => assertKeepsAnAdmin({ targetIsActiveAdmin: true, activeAdminCount: 1 })).toThrow(
      LastAdminError,
    );
  });

  it('permite retirar a un administrador si queda otro activo', () => {
    expect(() =>
      assertKeepsAnAdmin({ targetIsActiveAdmin: true, activeAdminCount: 2 }),
    ).not.toThrow();
  });

  it('no aplica si el afectado no es un administrador activo', () => {
    expect(() =>
      assertKeepsAnAdmin({ targetIsActiveAdmin: false, activeAdminCount: 1 }),
    ).not.toThrow();
  });
});
