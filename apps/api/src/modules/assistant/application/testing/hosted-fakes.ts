import type { HostedProviderId } from '../../domain/hosted-provider';
import {
  type EncryptedSecret,
  type HostedProviderGateway,
  type HostedSetting,
  type HostedSettingStore,
  type SecretCipher,
  SecretDecryptionError,
} from '../ports/hosted-provider';
import type { LanguageModel } from '../ports/language-model';

/** Deterministic and reversible, clearly not encryption: for tests only. */
export class FakeSecretCipher implements SecretCipher {
  constructor(private readonly masterKey = 'master-1') {}

  encrypt(plaintext: string): EncryptedSecret {
    return {
      ciphertext: Buffer.from(plaintext.split('').reverse().join('')).toString('base64'),
      iv: 'iv',
      tag: this.masterKey,
    };
  }

  decrypt(secret: EncryptedSecret): string {
    if (secret.tag !== this.masterKey) throw new SecretDecryptionError();
    return Buffer.from(secret.ciphertext, 'base64').toString().split('').reverse().join('');
  }
}

export class InMemoryHostedStore implements HostedSettingStore {
  readonly rows = new Map<string, HostedSetting>();

  async getHosted(cooperativeId: string) {
    return this.rows.get(cooperativeId) ?? null;
  }
  async setHosted(cooperativeId: string, hosted: HostedSetting) {
    this.rows.set(cooperativeId, hosted);
  }
  async clearHosted(cooperativeId: string) {
    this.rows.delete(cooperativeId);
  }
}

/** Provider gateway with no network: the models a key lists, and its failure, are scripted. */
export class FakeHostedGateway implements HostedProviderGateway {
  models: readonly string[] = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
  /** When set, `listModels` fails with it. */
  failure: Error | null = null;
  chatModel: LanguageModel | null = null;
  readonly listCalls: { provider: HostedProviderId; apiKey: string }[] = [];
  readonly created: { provider: HostedProviderId; model: string; apiKey: string }[] = [];

  async listModels(provider: HostedProviderId, apiKey: string) {
    this.listCalls.push({ provider, apiKey });
    if (this.failure) throw this.failure;
    return this.models;
  }

  createModel(provider: HostedProviderId, model: string, apiKey: string): LanguageModel {
    this.created.push({ provider, model, apiKey });
    if (!this.chatModel) throw new Error('No chat model scripted.');
    return this.chatModel;
  }
}
