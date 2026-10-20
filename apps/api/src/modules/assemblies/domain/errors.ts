/** Base class for business-rule violations of the assemblies module. */
export abstract class AssemblyDomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidAssemblyError extends AssemblyDomainError {
  readonly code = 'invalid_assembly';
}

/** BR-ASM-09: tells the minimum notice (US-ASM-01). */
export class InsufficientNoticeError extends AssemblyDomainError {
  readonly code = 'insufficient_notice';

  constructor(readonly minNoticeDays: number) {
    super(`The assembly must be convened at least ${minNoticeDays} days in advance.`);
  }
}

export class InvalidAssemblyTransitionError extends AssemblyDomainError {
  readonly code = 'invalid_assembly_transition';
}

export class InvalidVotingTransitionError extends AssemblyDomainError {
  readonly code = 'invalid_voting_transition';
}

/** US-ASM-05: not a partner, or not in the census frozen when the voting opened: 403. */
export class NotInCensusError extends AssemblyDomainError {
  readonly code = 'not_in_census';

  constructor() {
    super('You are not in the census of this voting: only members active when it opened can vote.');
  }
}

/** BR-ASM-03: one vote per member and item, not changeable. */
export class AlreadyVotedError extends AssemblyDomainError {
  readonly code = 'already_voted';

  constructor(readonly choice: VoteChoice) {
    super('You have already voted on this item; the vote cannot be changed.');
  }
}

export class VotingClosedError extends AssemblyDomainError {
  readonly code = 'voting_not_open';

  constructor() {
    super('The voting is not open.');
  }
}

export type VoteChoice = 'in_favor' | 'against' | 'abstention';
