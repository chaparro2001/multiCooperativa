import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { BrandingRecord, BrandingStore } from '../application/ports/branding-store';

/** One row per cooperative, keyed by its id: a read or write cannot cross cooperatives (ADR-003). */
export class PrismaBrandingStore implements BrandingStore {
  constructor(private readonly prisma: PrismaClient) {}

  async find(cooperativeId: string): Promise<BrandingRecord | null> {
    const row = await this.prisma.cooperativeBranding.findUnique({ where: { cooperativeId } });
    if (!row) return null;
    return {
      primaryColor: row.primaryColor,
      updatedAt: row.updatedAt,
    };
  }

  async save(cooperativeId: string, record: BrandingRecord): Promise<void> {
    await this.prisma.cooperativeBranding.upsert({
      where: { cooperativeId },
      create: { cooperativeId, ...record },
      update: record,
    });
  }
}
