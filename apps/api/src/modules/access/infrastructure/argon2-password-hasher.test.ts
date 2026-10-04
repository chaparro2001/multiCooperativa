import { describe, expect, it } from 'vitest';

import { Argon2PasswordHasher } from './argon2-password-hasher';

const hasher = new Argon2PasswordHasher();

describe('Argon2PasswordHasher (RNF-ACC-01)', () => {
  it('genera un hash Argon2id que no contiene la contraseña', async () => {
    const hash = await hasher.hash('una-clave-larga');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('una-clave-larga');
  });

  it('verifica la contraseña correcta y rechaza la incorrecta', async () => {
    const hash = await hasher.hash('una-clave-larga');

    expect(await hasher.verify(hash, 'una-clave-larga')).toBe(true);
    expect(await hasher.verify(hash, 'otra-clave-larga')).toBe(false);
  });

  it('un hash almacenado corrupto se trata como contraseña incorrecta', async () => {
    expect(await hasher.verify('no-es-un-hash', 'una-clave-larga')).toBe(false);
  });

  it('sin hash (usuario inexistente o sin activar) siempre es falso', async () => {
    expect(await hasher.verify(null, 'contraseña-ficticia-para-igualar-tiempos')).toBe(false);
  });
});
