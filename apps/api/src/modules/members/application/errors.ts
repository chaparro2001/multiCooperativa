/** Base class for failures of the member area use cases that are not domain rules. */
export abstract class MembersApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Does not exist, belongs to another cooperative, is not a partner, or is another
 * member's record asked for with "own" scope: all look the same (US-MEM-01, ADR-003).
 */
export class MemberNotFoundError extends MembersApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('Not found.');
  }
}
