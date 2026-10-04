/** Base class for failures of the announcement use cases that are not domain rules. */
export abstract class AnnouncementApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Does not exist, belongs to another cooperative, or is a draft or withdrawn
 * one asked for with only «consulta»: all look the same (HU-COM-03, ADR-003).
 */
export class AnnouncementNotFoundError extends AnnouncementApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('No encontrado.');
  }
}
