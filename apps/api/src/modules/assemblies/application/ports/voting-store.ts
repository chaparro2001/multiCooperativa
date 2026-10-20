import type { AssemblyStatus } from '../../domain/assembly';
import type { VoteChoice } from '../../domain/errors';
import type { VotingStatus } from '../../domain/voting';
import type { Majority, Tally, VotingPolicy, VotingResult } from '../../domain/voting-result';

/** Rules frozen when the voting opens. */
export interface VotingSnapshot {
  majority: Majority;
  policy: VotingPolicy;
  secondCallAvailable: boolean;
}

export interface VotingRecord extends VotingSnapshot {
  id: string;
  pointId: string;
  status: Exclude<VotingStatus, 'pending'>;
  openedAt: Date;
  closedAt: Date | null;
  censusSize: number;
  tally: Tally;
  result: VotingResult | null;
}

/** A voting as seen by one member. */
export interface MemberVotingView extends VotingRecord {
  inCensus: boolean;
  myVote: VoteChoice | null;
}

export interface OpenCheck {
  assemblyStatus: AssemblyStatus;
  votable: boolean;
  majority: Majority | null;
  votingStatus: VotingStatus;
  secondCallAvailable: boolean;
}

/** Every method is scoped to one cooperative (ADR-003). */
export interface VotingStore {
  /**
   * Locked on the item. `decide` validates and returns the frozen rules; the
   * census rows are written in the same transaction (BR-ASM-02). Null if the item does not exist here.
   */
  open(
    cooperativeId: string,
    pointId: string,
    census: string[],
    at: Date,
    decide: (check: OpenCheck) => VotingSnapshot,
  ): Promise<VotingRecord | null>;
  /** Locked: no vote can slip in while the result is computed. */
  close(
    cooperativeId: string,
    pointId: string,
    at: Date,
    decide: (voting: VotingRecord) => VotingResult,
  ): Promise<VotingRecord | null>;
  /**
   * BR-ASM-03: the unique key settles races; `check` sees the state and may refuse.
   * Null if the item does not exist here.
   */
  castVote(
    cooperativeId: string,
    pointId: string,
    membershipId: string,
    choice: VoteChoice,
    check: (state: {
      votingStatus: VotingStatus;
      inCensus: boolean;
      previousVote: VoteChoice | null;
    }) => void,
  ): Promise<MemberVotingView | null>;
  /** Null when the item has no voting yet ("pending"). */
  find(
    cooperativeId: string,
    pointId: string,
    membershipId: string,
  ): Promise<MemberVotingView | null>;
  findForPoints(
    cooperativeId: string,
    pointIds: string[],
    membershipId: string,
  ): Promise<Map<string, MemberVotingView>>;
}
