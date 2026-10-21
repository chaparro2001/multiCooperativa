import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SecretDecryptionError } from '../application/ports/hosted-provider';
import { AesGcmSecretCipher, isValidMasterKey } from './aes-gcm-secret-cipher';

const masterKey = () => randomBytes(32).toString('base64');

describe('AesGcmSecretCipher (US-AI-07, ADR-018)', () => {
  it('round-trips a secret and never stores it in the clear', () => {
    const cipher = new AesGcmSecretCipher(masterKey());
    const encrypted = cipher.encrypt('gsk_secret-key-1234');
    expect(JSON.stringify(encrypted)).not.toContain('secret-key');
    expect(cipher.decrypt(encrypted)).toBe('gsk_secret-key-1234');
  });

  it('uses a fresh IV each time: the same secret encrypts differently', () => {
    const cipher = new AesGcmSecretCipher(masterKey());
    const a = cipher.encrypt('same');
    const b = cipher.encrypt('same');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('detects tampering with the ciphertext, the IV or the tag', () => {
    const cipher = new AesGcmSecretCipher(masterKey());
    const encrypted = cipher.encrypt('gsk_secret-key-1234');
    const flip = (value: string) => {
      const bytes = Buffer.from(value, 'base64');
      bytes[0] = (bytes[0] ?? 0) ^ 1;
      return bytes.toString('base64');
    };
    expect(() => cipher.decrypt({ ...encrypted, ciphertext: flip(encrypted.ciphertext) })).toThrow(
      SecretDecryptionError,
    );
    expect(() => cipher.decrypt({ ...encrypted, iv: flip(encrypted.iv) })).toThrow(
      SecretDecryptionError,
    );
    expect(() => cipher.decrypt({ ...encrypted, tag: flip(encrypted.tag) })).toThrow(
      SecretDecryptionError,
    );
  });

  it('cannot decrypt with another master key (rotation invalidates stored keys)', () => {
    const encrypted = new AesGcmSecretCipher(masterKey()).encrypt('gsk_secret-key-1234');
    expect(() => new AesGcmSecretCipher(masterKey()).decrypt(encrypted)).toThrow(
      SecretDecryptionError,
    );
  });

  it('accepts only 32 bytes in base64 as master key', () => {
    expect(isValidMasterKey(masterKey())).toBe(true);
    expect(isValidMasterKey(randomBytes(16).toString('base64'))).toBe(false);
    expect(isValidMasterKey('not base64!')).toBe(false);
    expect(() => new AesGcmSecretCipher('short')).toThrow();
  });
});
