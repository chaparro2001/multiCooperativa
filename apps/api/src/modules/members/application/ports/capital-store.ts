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

/**
 * Persistence of capital movements. Every method takes the cooperative: reads
 * without it do not exist (ADR-003). There is no update or delete: BR-MEM-01.
 */
export interface CapitalStore {
  /** Newest first. */
  listMovements(cooperativeId: string, membershipId: string): Promise<MovementRecord[]>;
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
