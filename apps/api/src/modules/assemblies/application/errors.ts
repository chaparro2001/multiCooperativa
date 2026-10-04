/** Base class for failures of the assembly use cases that are not domain rules. */
export abstract class AssemblyApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Missing, from another cooperative, or a draft asked for without «gestión». */
export class AssemblyNotFoundError extends AssemblyApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('No encontrado.');
  }
}
