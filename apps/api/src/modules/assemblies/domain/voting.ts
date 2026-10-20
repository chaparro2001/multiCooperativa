import type { AssemblyStatus } from './assembly';
import {
  AlreadyVotedError,
  InvalidVotingTransitionError,
  NotInCensusError,
  type VoteChoice,
  VotingClosedError,
} from './errors';
import type { Tally } from './voting-result';

export type VotingStatus = 'pending' | 'open' | 'closed';
export const VOTE_CHOICES: readonly VoteChoice[] = ['in_favor', 'against', 'abstention'];

/** US-ASM-04: a votable item of a convened assembly, with somebody entitled to vote. */
export function assertCanOpen(input: {
  assemblyStatus: AssemblyStatus;
  votable: boolean;
  votingStatus: VotingStatus;
  censusSize: number;
}): void {
  if (input.assemblyStatus !== 'convened') {
    throw new InvalidVotingTransitionError('Voting only happens in a convened assembly.');
  }
  if (!input.votable) throw new InvalidVotingTransitionError('This item is not put to a vote.');
  if (input.votingStatus !== 'pending') {
    throw new InvalidVotingTransitionError('The voting for this item has already been opened.');
  }
  if (input.censusSize === 0) {
    throw new InvalidVotingTransitionError('There are no active members entitled to vote.');
  }
}

export function assertCanClose(votingStatus: VotingStatus): void {
  if (votingStatus !== 'open') {
    throw new InvalidVotingTransitionError('Only an open voting can be closed.');
  }
}

/** US-ASM-05, in the order the member would want to hear it. */
export function assertCanVote(input: {
  votingStatus: VotingStatus;
  inCensus: boolean;
  previousVote: VoteChoice | null;
}): void {
  // Not opened yet: there is no census to be in.
  if (input.votingStatus === 'pending') throw new VotingClosedError();
  if (!input.inCensus) throw new NotInCensusError();
  if (input.previousVote) throw new AlreadyVotedError(input.previousVote);
  if (input.votingStatus !== 'open') throw new VotingClosedError();
}

/** BR-ASM-11: while open, how people voted is visible only with "manage". */
export function visibleTally(status: VotingStatus, canManage: boolean, tally: Tally): Tally | null {
  return status === 'closed' || canManage ? tally : null;
}
