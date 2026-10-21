import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import {
  type EncryptedSecret,
  type SecretCipher,
  SecretDecryptionError,
} from '../application/ports/hosted-provider';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** True when the text is base64 of exactly 32 bytes: a valid ASSISTANT_SECRETS_KEY. */
export function isValidMasterKey(base64: string): boolean {
  return (
    /^[A-Za-z0-9+/]+={0,2}$/.test(base64) && Buffer.from(base64, 'base64').length === KEY_BYTES
  );
}

/**
 * AES-256-GCM with the server's master key (ADR-018). A fresh random IV per encryption; the
 * authentication tag makes any alteration of the stored data, or a different master key, fail
 * on decrypt instead of returning garbage.
 */
export class AesGcmSecretCipher implements SecretCipher {
  private readonly key: Buffer;

  constructor(masterKeyBase64: string) {
    if (!isValidMasterKey(masterKeyBase64)) {
      throw new Error('The master key must be 32 bytes encoded in base64.');
    }
    this.key = Buffer.from(masterKeyBase64, 'base64');
  }

  encrypt(plaintext: string): EncryptedSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(secret: EncryptedSecret): string {
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(secret.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(secret.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new SecretDecryptionError(error);
    }
  }
}
