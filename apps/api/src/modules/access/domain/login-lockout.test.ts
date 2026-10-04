import { describe, expect, it } from 'vitest';

import { lockedUntil } from './login-lockout';

const start = new Date('2026-10-05T10:00:00Z');
const minutes = (n: number) => new Date(start.getTime() + n * 60 * 1000);

describe('bloqueo por intentos (RN-ACC-11)', () => {
  it('sin intentos fallidos no hay bloqueo', () => {
    expect(lockedUntil([], minutes(0))).toBeNull();
  });

  it('cuatro intentos fallidos no bloquean', () => {
    expect(lockedUntil([0, 1, 2, 3].map(minutes), minutes(4))).toBeNull();
  });

  it('cinco intentos fallidos en 15 minutos bloquean 15 minutos desde el quinto', () => {
    expect(lockedUntil([0, 3, 6, 9, 12].map(minutes), minutes(13))).toEqual(minutes(27));
  });

  it('cinco intentos repartidos en más de 15 minutos no bloquean', () => {
    expect(lockedUntil([0, 4, 8, 12, 16].map(minutes), minutes(17))).toBeNull();
  });

  it('el bloqueo termina a los 15 minutos', () => {
    const failures = [0, 1, 2, 3, 4].map(minutes);

    expect(lockedUntil(failures, minutes(18))).toEqual(minutes(19));
    expect(lockedUntil(failures, minutes(19))).toBeNull();
  });

  it('no depende del orden de los intentos', () => {
    expect(lockedUntil([4, 2, 0, 3, 1].map(minutes), minutes(5))).toEqual(minutes(19));
  });
});
