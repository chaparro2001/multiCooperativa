import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { CapitalStore, MovementRecord } from '../application/ports/capital-store';
import { balanceOf, effectOf, type Movement } from '../domain/capital';
import { formatMoney, parseMoney } from '../domain/money';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Decimals cross the boundary as exact strings, never through `number` (BR-MEM-04). */
type DecimalLike = { toFixed(digits: number): string };

interface Row {
  id: string;
  membershipId: string;
  date: Date;
  type: MovementRecord['type'];
  concept: string;
  amount: DecimalLike;
  recordedByMembershipId: string;
  recordedAt: Date;
}

const toRecord = (row: Row): MovementRecord => ({
  id: row.id,
  membershipId: row.membershipId,
  date: row.date.toISOString().slice(0, 10),
  type: row.type,
  concept: row.concept,
  amountCents: parseMoney(row.amount.toFixed(2)),
  recordedByMembershipId: row.recordedByMembershipId,
  recordedAt: row.recordedAt,
});

const select = {
  id: true,
  membershipId: true,
  date: true,
  type: true,
  concept: true,
  amount: true,
  recordedByMembershipId: true,
  recordedAt: true,
} as const;

export class PrismaCapitalStore implements CapitalStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listMovements(cooperativeId: string, membershipId: string): Promise<MovementRecord[]> {
    const rows = await this.prisma.capitalMovement.findMany({
      where: { cooperativeId, membershipId },
      orderBy: [{ date: 'desc' }, { recordedAt: 'desc' }, { id: 'desc' }],
      select,
    });
    return rows.map(toRecord);
  }

  async balances(cooperativeId: string, membershipIds: string[]): Promise<Map<string, bigint>> {
    if (membershipIds.length === 0) return new Map();
    const sums = await this.prisma.capitalMovement.groupBy({
      by: ['membershipId', 'type'],
      where: { cooperativeId, membershipId: { in: membershipIds } },
      _sum: { amount: true },
    });
    const balances = new Map<string, bigint>();
    for (const sum of sums) {
      if (!sum._sum.amount) continue;
      const effect = effectOf(sum.type, parseMoney(sum._sum.amount.toFixed(2)));
      balances.set(sum.membershipId, (balances.get(sum.membershipId) ?? 0n) + effect);
    }
    return balances;
  }

  async append(
    cooperativeId: string,
    membershipId: string,
    recordedByMembershipId: string,
    decide: (currentBalanceCents: bigint) => Movement,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockMember(tx, membershipId);
      const current = await tx.capitalMovement.findMany({
        where: { cooperativeId, membershipId },
        select,
      });
      const movement = decide(balanceOf(current.map(toRecord)));
      const created = await tx.capitalMovement.create({
        data: {
          cooperativeId,
          membershipId,
          date: new Date(`${movement.date}T00:00:00Z`),
          type: movement.type,
          concept: movement.concept,
          amount: formatMoney(movement.amountCents),
          recordedByMembershipId,
        },
        select,
      });
      const record = toRecord(created);
      return { movement: record, balanceCents: balanceOf([...current.map(toRecord), record]) };
    });
  }
}

/**
 * Serializes the movements of one member, so two refunds cannot both pass the check of the
 * available capital (BR-MEM-03). An advisory lock: the membership table belongs to another module.
 */
async function lockMember(tx: Transaction, membershipId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`capital:${membershipId}`}))`;
}
