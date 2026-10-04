/** Base class for failures of the document use cases that are not domain rules. */
export abstract class DocumentApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Missing, from another cooperative, or withdrawn and asked with only «consulta». */
export class DocumentNotFoundError extends DocumentApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('No encontrado.');
  }
}
