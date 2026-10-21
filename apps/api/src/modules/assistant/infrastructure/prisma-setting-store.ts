import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { AssistantSettingStore } from '../application/ports/local-models';

/** One row per cooperative, keyed by its id: a read or write cannot cross cooperatives (ADR-003). */
export class PrismaAssistantSettingStore implements AssistantSettingStore {
  constructor(private readonly prisma: PrismaClient) {}

  async getModel(cooperativeId: string): Promise<string | null> {
    const row = await this.prisma.assistantSetting.findUnique({ where: { cooperativeId } });
    return row?.model ?? null;
  }

  async setModel(cooperativeId: string, model: string | null): Promise<void> {
    if (model === null) {
      await this.prisma.assistantSetting.deleteMany({ where: { cooperativeId } });
      return;
    }
    await this.prisma.assistantSetting.upsert({
      where: { cooperativeId },
      create: { cooperativeId, model },
      update: { model },
    });
  }
}
