import type { PageRequest } from '../../../../shared/pagination';
import type { Movement, MovementType } from '../../domain/capital';

export interface MovementRecord {
  id: string;
  membershipId: string;
  /** YYYY-MM-DD. */
  date: string;
  type: MovementType;
  concept: string;
  amountCents: bigint;
  recordedByMembershipId: string;
  recordedAt: Date;
}

export interface PeriodTotals {
  contributionsCents: bigint;
  refundsCents: bigint;
  /** Net of the corrections (signed). */
  correctionsCents: bigint;
}

/**
 * Persistence of capital movements. Every method takes the cooperative: reads
 * without it do not exist (ADR-003). There is no update or delete: BR-MEM-01.
 */
export interface CapitalStore {
  /**
   * Newest first by (date, recordedAt, id). A keyset page: the cursor is [date, recordedAt as
   * ISO, id] of the last row seen and `page.limit` rows are returned at most.
   */
  listMovements(
    cooperativeId: string,
    membershipId: string,
    page: PageRequest,
  ): Promise<MovementRecord[]>;
  /**
   * Movements of the whole cooperative registered in a period (ADR-025), as cents of what was
   * registered: contributions (mandatory and voluntary) and refunds are positive, corrections
   * are signed. `from` and `to` are YYYY-MM-DD, inclusive; a missing bound is open.
   */
  periodTotals(
    cooperativeId: string,
    period: { from?: string; to?: string },
  ): Promise<PeriodTotals>;
  /** Capital in cents of each membership that has movements; the others are absent. */
  balances(cooperativeId: string, membershipIds: string[]): Promise<Map<string, bigint>>;
  /**
   * Appends a movement atomically with the check of the current capital: concurrent
   * refunds cannot both pass (BR-MEM-03). `decide` throws to reject.
   */
  append(
    cooperativeId: string,
    membershipId: string,
    recordedByMembershipId: string,
    decide: (currentBalanceCents: bigint) => Movement,
  ): Promise<{ movement: MovementRecord; balanceCents: bigint }>;
}
