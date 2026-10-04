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

/** RN-ASA-09: tells the minimum notice (HU-ASA-01). */
export class InsufficientNoticeError extends AssemblyDomainError {
  readonly code = 'insufficient_notice';

  constructor(readonly minNoticeDays: number) {
    super(`La asamblea debe convocarse con al menos ${minNoticeDays} días de antelación.`);
  }
}

export class InvalidAssemblyTransitionError extends AssemblyDomainError {
  readonly code = 'invalid_assembly_transition';
}

export class InvalidVotingTransitionError extends AssemblyDomainError {
  readonly code = 'invalid_voting_transition';
}

/** HU-ASA-05: not a partner, or not in the census frozen when the voting opened: 403. */
export class NotInCensusError extends AssemblyDomainError {
  readonly code = 'not_in_census';

  constructor() {
    super('No figuras en el censo de esta votación: solo votan los socios activos al abrirla.');
  }
}

/** RN-ASA-03: one vote per member and item, not changeable. */
export class AlreadyVotedError extends AssemblyDomainError {
  readonly code = 'already_voted';

  constructor(readonly choice: VoteChoice) {
    super('Ya has votado este punto; el voto no se puede cambiar.');
  }
}

export class VotingClosedError extends AssemblyDomainError {
  readonly code = 'voting_not_open';

  constructor() {
    super('La votación no está abierta.');
  }
}

export type VoteChoice = 'a_favor' | 'en_contra' | 'abstencion';
