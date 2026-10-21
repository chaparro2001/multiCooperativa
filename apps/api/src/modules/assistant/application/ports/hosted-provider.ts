import type { HostedProviderId } from '../../domain/hosted-provider';
import type { LanguageModel } from './language-model';

/** A secret encrypted at rest (AES-256-GCM): three base64 parts that travel together. */
export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

/** Encrypts the cooperatives' API keys with the server's master key (ASSISTANT_SECRETS_KEY). */
export interface SecretCipher {
  encrypt(plaintext: string): EncryptedSecret;
  /** Throws SecretDecryptionError when the data was altered or the master key is not the one that encrypted it. */
  decrypt(secret: EncryptedSecret): string;
}

export class SecretDecryptionError extends Error {
  constructor(cause?: unknown) {
    super('The stored secret cannot be decrypted.', { cause });
    this.name = 'SecretDecryptionError';
  }
}

/** The failures of a hosted provider. The message never contains the API key. */
export class HostedProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = new.target.name;
  }
}

/** 401 / 403: the key is wrong, revoked or without access to the model. */
export class HostedProviderKeyInvalidError extends HostedProviderError {}

/** 429, 5xx, timeout or network failure: worth trying again later or elsewhere. */
export class HostedProviderTransientError extends HostedProviderError {}

/** What the cooperative saved to use a hosted provider. */
export interface HostedSetting {
  provider: HostedProviderId;
  model: string;
  key: EncryptedSecret;
  /** Last four characters of the key, the only part that can be shown. */
  keyHint: string;
}

/** Always scoped to a cooperative (ADR-003). */
export interface HostedSettingStore {
  /** The hosted configuration while the cooperative's source is hosted; null otherwise. */
  getHosted(cooperativeId: string): Promise<HostedSetting | null>;
  /** Switches the cooperative to the hosted provider (replaces any previous hosted configuration). */
  setHosted(cooperativeId: string, hosted: HostedSetting): Promise<void>;
  /** Back to the local source: erases the hosted configuration and the encrypted key. */
  clearHosted(cooperativeId: string): Promise<void>;
}

/** Talks to the fixed catalog of providers (ADR-018). */
export interface HostedProviderGateway {
  /** Model ids the key can use. Throws HostedProviderKeyInvalidError or another HostedProviderError. */
  listModels(provider: HostedProviderId, apiKey: string): Promise<readonly string[]>;
  createModel(provider: HostedProviderId, model: string, apiKey: string): LanguageModel;
}

/** Marks the `raw` of a turn produced by a hosted model, so another provider never receives it. */
export const HOSTED_RAW_MARK = 'openai-compatible';

export const isHostedRaw = (raw: unknown): boolean =>
  typeof raw === 'object' &&
  raw !== null &&
  (raw as { provider?: unknown }).provider === HOSTED_RAW_MARK;
