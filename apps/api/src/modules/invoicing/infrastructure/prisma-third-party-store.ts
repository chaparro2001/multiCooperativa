import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { ThirdPartyState } from '../domain/documents';
import type { ThirdPartyRecord, ThirdPartyStore } from '../application/ports/third-party-store';

const select = {
  id: true,
  cooperativeId: true,
  nif: true,
  name: true,
  isSupplier: true,
  isCustomer: true,
  email: true,
  phone: true,
  active: true,
  createdAt: true,
} as const;

const toData = (state: ThirdPartyState) => ({
  nif: state.nif,
  name: state.name,
  isSupplier: state.isSupplier,
  isCustomer: state.isCustomer,
  email: state.email,
  phone: state.phone,
  active: state.active,
});

export class PrismaThirdPartyStore implements ThirdPartyStore {
  constructor(private readonly prisma: PrismaClient) {}

  list(
    cooperativeId: string,
    query: { role?: 'proveedor' | 'cliente'; search?: string; includeInactive: boolean },
  ): Promise<ThirdPartyRecord[]> {
    return this.prisma.thirdParty.findMany({
      where: {
        cooperativeId,
        ...(!query.includeInactive && { active: true }),
        ...(query.role === 'proveedor' && { isSupplier: true }),
        ...(query.role === 'cliente' && { isCustomer: true }),
        ...(query.search && {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { nif: { contains: query.search.toUpperCase().replace(/[\s.-]/g, '') } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
      select,
    });
  }

  find(cooperativeId: string, id: string): Promise<ThirdPartyRecord | null> {
    return this.prisma.thirdParty.findFirst({ where: { id, cooperativeId }, select });
  }

  findByNif(cooperativeId: string, nif: string): Promise<ThirdPartyRecord | null> {
    return this.prisma.thirdParty.findUnique({
      where: { cooperativeId_nif: { cooperativeId, nif } },
      select,
    });
  }

  async create(
    cooperativeId: string,
    state: ThirdPartyState,
  ): Promise<{ created: ThirdPartyRecord } | { existing: ThirdPartyRecord }> {
    try {
      return {
        created: await this.prisma.thirdParty.create({
          data: { cooperativeId, ...toData(state) },
          select,
        }),
      };
    } catch (error) {
      if ((error as { code?: unknown }).code !== 'P2002') throw error;
      const existing = await this.findByNif(cooperativeId, state.nif);
      if (!existing) throw error;
      return { existing };
    }
  }

  update(
    cooperativeId: string,
    id: string,
    decide: (current: ThirdPartyRecord) => ThirdPartyState,
  ): Promise<ThirdPartyRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.thirdParty.findFirst({ where: { id, cooperativeId }, select });
      if (!current) return null;
      return tx.thirdParty.update({ where: { id }, data: toData(decide(current)), select });
    });
  }
}
