import { createHash, randomBytes } from 'node:crypto';

import type { SecretTokens } from '../application/ports/tokens';

/**
 * 256 random bits. With that much entropy a fast hash is enough: unlike a
 * password, the secret cannot be guessed by brute force from its SHA-256.
 */
export class CryptoSecretTokens implements SecretTokens {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
