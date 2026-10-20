import { describe, expect, it } from 'vitest';

import { Argon2PasswordHasher } from './argon2-password-hasher';

const hasher = new Argon2PasswordHasher();

describe('Argon2PasswordHasher (NFR-ACC-01)', () => {
  it('generates an Argon2id hash that does not contain the password', async () => {
    const hash = await hasher.hash('a-long-password');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('a-long-password');
  });

  it('verifies the correct password and rejects the wrong one', async () => {
    const hash = await hasher.hash('a-long-password');

    expect(await hasher.verify(hash, 'a-long-password')).toBe(true);
    expect(await hasher.verify(hash, 'otra-clave-larga')).toBe(false);
  });

  it('a corrupt stored hash is treated as a wrong password', async () => {
    expect(await hasher.verify('not-a-hash', 'a-long-password')).toBe(false);
  });

  it('without a hash (nonexistent or not activated user) it is always false', async () => {
    expect(await hasher.verify(null, 'dummy-password-to-equalize-timing')).toBe(false);
  });
});
