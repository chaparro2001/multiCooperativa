import { balanceOf, type Movement } from '../../domain/capital';
import type { CapitalStore, MovementRecord } from '../ports/capital-store';

/** For use case tests: same contract as the Prisma store, without a database. */
export class InMemoryCapitalStore implements CapitalStore {
  readonly rows: (MovementRecord & { cooperativeId: string })[] = [];
  private sequence = 0;

  add(cooperativeId: string, membershipId: string, movement: Movement) {
    this.sequence += 1;
    const row = {
      id: `00000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`,
      cooperativeId,
      membershipId,
      ...movement,
      amountCents: movement.amountCents,
      recordedByMembershipId: 'seed',
      recordedAt: new Date(2026, 9, 1, 0, 0, this.sequence),
    };
    this.rows.push(row);
    return row;
  }

  private of(cooperativeId: string, membershipId: string) {
    return this.rows.filter(
      (row) => row.cooperativeId === cooperativeId && row.membershipId === membershipId,
    );
  }

  async listMovements(
    cooperativeId: string,
    membershipId: string,
    page: { limit: number; cursor?: readonly string[] } = { limit: Number.MAX_SAFE_INTEGER },
  ) {
    const [day, recorded, id] = page.cursor ?? [];
    return this.of(cooperativeId, membershipId)
      .slice()
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.recordedAt.getTime() - a.recordedAt.getTime() ||
          b.id.localeCompare(a.id),
      )
      .filter(
        (row) =>
          day === undefined ||
          row.date < day ||
          (row.date === day &&
            (row.recordedAt.toISOString() < recorded! ||
              (row.recordedAt.toISOString() === recorded && row.id < id!))),
      )
      .slice(0, page.limit);
  }

  async balances(cooperativeId: string, membershipIds: string[]) {
    const result = new Map<string, bigint>();
    for (const id of membershipIds) {
      const rows = this.of(cooperativeId, id);
      if (rows.length > 0) result.set(id, balanceOf(rows));
    }
    return result;
  }

  async append(
    cooperativeId: string,
    membershipId: string,
    recordedByMembershipId: string,
    decide: (currentBalanceCents: bigint) => Movement,
  ) {
    const movement = decide(balanceOf(this.of(cooperativeId, membershipId)));
    const row = this.add(cooperativeId, membershipId, movement);
    row.recordedByMembershipId = recordedByMembershipId;
    return { movement: row, balanceCents: balanceOf(this.of(cooperativeId, membershipId)) };
  }
}
