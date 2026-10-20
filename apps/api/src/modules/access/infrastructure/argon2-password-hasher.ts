import { hash, verify } from '@node-rs/argon2';

import type { PasswordHasher } from '../application/ports/password-hasher';

/** Argon2id, which is the algorithm the library uses by default (NFR-ACC-01). */
export class Argon2PasswordHasher implements PasswordHasher {
  // Checked against when there is no real hash, so both paths cost the same.
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    if (passwordHash === null) {
      this.dummyHash ??= hash('dummy-password-to-equalize-timing');
      await this.check(await this.dummyHash, password);
      return false;
    }
    return this.check(passwordHash, password);
  }

  private async check(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // A malformed stored hash must read as "wrong password", never as a crash.
      return false;
    }
  }
}
