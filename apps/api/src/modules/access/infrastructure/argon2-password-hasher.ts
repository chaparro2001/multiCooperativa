import { hash, verify } from '@node-rs/argon2';

import type { PasswordHasher } from '../application/ports/password-hasher';

/** Argon2id, which is the algorithm the library uses by default (RNF-ACC-01). */
export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // A malformed stored hash must read as "wrong password", never as a crash.
      return false;
    }
  }
}
