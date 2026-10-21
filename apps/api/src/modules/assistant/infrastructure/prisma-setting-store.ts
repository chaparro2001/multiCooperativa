import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { HostedSetting, HostedSettingStore } from '../application/ports/hosted-provider';
import type { AssistantSettingStore } from '../application/ports/local-models';
import { findHostedProvider } from '../domain/hosted-provider';

/** One row per cooperative, keyed by its id: a read or write cannot cross cooperatives (ADR-003). */
export class PrismaAssistantSettingStore implements AssistantSettingStore, HostedSettingStore {
  constructor(private readonly prisma: PrismaClient) {}

  async getModel(cooperativeId: string): Promise<string | null> {
    const row = await this.prisma.assistantSetting.findUnique({ where: { cooperativeId } });
    return row?.model ?? null;
  }

  /** A local choice switches the cooperative to its local source and drops any hosted configuration (and its key). */
  async setModel(cooperativeId: string, model: string | null): Promise<void> {
    if (model === null) {
      await this.prisma.assistantSetting.deleteMany({ where: { cooperativeId } });
      return;
    }
    await this.prisma.assistantSetting.upsert({
      where: { cooperativeId },
      create: { cooperativeId, model },
      update: { model, ...CLEARED_HOSTED },
    });
  }

  /** Back to the local source: the hosted configuration and its encrypted key are erased; a saved local model stays. */
  async clearHosted(cooperativeId: string): Promise<void> {
    await this.prisma.assistantSetting.updateMany({
      where: { cooperativeId },
      data: CLEARED_HOSTED,
    });
    await this.prisma.assistantSetting.deleteMany({ where: { cooperativeId, model: null } });
  }

  async getHosted(cooperativeId: string): Promise<HostedSetting | null> {
    const row = await this.prisma.assistantSetting.findUnique({ where: { cooperativeId } });
    if (
      !row ||
      row.source !== 'hosted' ||
      !row.hostedModel ||
      !row.apiKeyCiphertext ||
      !row.apiKeyIv ||
      !row.apiKeyTag ||
      !row.apiKeyHint
    ) {
      return null;
    }
    const provider = row.hostedProvider ? findHostedProvider(row.hostedProvider) : null;
    if (!provider) return null;
    return {
      provider: provider.id,
      model: row.hostedModel,
      key: { ciphertext: row.apiKeyCiphertext, iv: row.apiKeyIv, tag: row.apiKeyTag },
      keyHint: row.apiKeyHint,
    };
  }

  async setHosted(cooperativeId: string, hosted: HostedSetting): Promise<void> {
    const data = {
      source: 'hosted',
      hostedProvider: hosted.provider,
      hostedModel: hosted.model,
      apiKeyCiphertext: hosted.key.ciphertext,
      apiKeyIv: hosted.key.iv,
      apiKeyTag: hosted.key.tag,
      apiKeyHint: hosted.keyHint,
    };
    await this.prisma.assistantSetting.upsert({
      where: { cooperativeId },
      create: { cooperativeId, ...data },
      update: data,
    });
  }
}

const CLEARED_HOSTED = {
  source: 'local',
  hostedProvider: null,
  hostedModel: null,
  apiKeyCiphertext: null,
  apiKeyIv: null,
  apiKeyTag: null,
  apiKeyHint: null,
};
