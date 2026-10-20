/** Base class for failures of the invoicing use cases that are not domain rules. */
export abstract class InvoicingApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Missing or from another cooperative: 404, even if the NIF matches (requirements/05, section 10). */
export class NotFoundError extends InvoicingApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('Not found.');
  }
}

/** US-INV-01: the existing party is offered instead of a duplicate (BR-INV-02). */
export class ThirdPartyExistsError extends InvoicingApplicationError {
  readonly code = 'third_party_exists';

  constructor(
    readonly thirdPartyId: string,
    readonly partyName: string,
  ) {
    super(`A third party with that NIF already exists in the cooperative: ${partyName}.`);
  }
}

/** BR-INV-04. */
export class DuplicateNumberError extends InvoicingApplicationError {
  readonly code = 'duplicate_number';

  constructor(what: 'delivery_note' | 'invoice') {
    super(
      `There is already ${what === 'delivery_note' ? 'a delivery note' : 'an invoice'} with that number.`,
    );
  }
}
