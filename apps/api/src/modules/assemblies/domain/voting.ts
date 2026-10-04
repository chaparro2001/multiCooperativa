import type { AssemblyStatus } from './assembly';
import {
  AlreadyVotedError,
  InvalidVotingTransitionError,
  NotInCensusError,
  type VoteChoice,
  VotingClosedError,
} from './errors';
import type { Tally } from './voting-result';

export type VotingStatus = 'pendiente' | 'abierta' | 'cerrada';
export const VOTE_CHOICES: readonly VoteChoice[] = ['a_favor', 'en_contra', 'abstencion'];

/** HU-ASA-04: a votable item of a convened assembly, with somebody entitled to vote. */
export function assertCanOpen(input: {
  assemblyStatus: AssemblyStatus;
  votable: boolean;
  votingStatus: VotingStatus;
  censusSize: number;
}): void {
  if (input.assemblyStatus !== 'convocada') {
    throw new InvalidVotingTransitionError('Solo se vota en una asamblea convocada.');
  }
  if (!input.votable) throw new InvalidVotingTransitionError('Este punto no se somete a votación.');
  if (input.votingStatus !== 'pendiente') {
    throw new InvalidVotingTransitionError('La votación de este punto ya se abrió.');
  }
  if (input.censusSize === 0) {
    throw new InvalidVotingTransitionError('No hay socios activos con derecho a voto.');
  }
}

export function assertCanClose(votingStatus: VotingStatus): void {
  if (votingStatus !== 'abierta') {
    throw new InvalidVotingTransitionError('Solo se puede cerrar una votación abierta.');
  }
}

/** HU-ASA-05, in the order the member would want to hear it. */
export function assertCanVote(input: {
  votingStatus: VotingStatus;
  inCensus: boolean;
  previousVote: VoteChoice | null;
}): void {
  if (!input.inCensus) throw new NotInCensusError();
  if (input.previousVote) throw new AlreadyVotedError(input.previousVote);
  if (input.votingStatus !== 'abierta') throw new VotingClosedError();
}

/** RN-ASA-11: while open, how people voted is visible only with «gestión». */
export function visibleTally(status: VotingStatus, canManage: boolean, tally: Tally): Tally | null {
  return status === 'cerrada' || canManage ? tally : null;
}
