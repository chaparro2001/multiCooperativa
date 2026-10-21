/** Base class for business-rule violations of the members module. */
export abstract class MembersDomainError extends Error {
  abstract readonly code: string;

  /** Contract path of the input field the rule is about, sent as `details.field`. */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
    this.name = new.target.name;
  }
}

/** The movement does not meet the form rules (US-MEM-03, BR-MEM-02, BR-MEM-04). */
export class InvalidMovementError extends MembersDomainError {
  readonly code = 'invalid_movement';
}

/** BR-MEM-03: the capital of a member is never negative. */
export class InsufficientCapitalError extends MembersDomainError {
  readonly code = 'insufficient_capital';

  constructor(readonly available: string) {
    super(`The movement would leave negative capital: the member has ${available} €.`);
  }
}
