/** Base class for failures of the invoicing use cases that are not domain rules. */
export abstract class InvoicingApplicationError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Missing or from another cooperative: 404, even if the NIF matches (requisitos/05, section 10). */
export class NotFoundError extends InvoicingApplicationError {
  readonly code = 'not_found';

  constructor() {
    super('No encontrado.');
  }
}

/** HU-FAC-01: the existing party is offered instead of a duplicate (RN-FAC-02). */
export class ThirdPartyExistsError extends InvoicingApplicationError {
  readonly code = 'third_party_exists';

  constructor(
    readonly thirdPartyId: string,
    readonly partyName: string,
  ) {
    super(`Ya existe un tercero con ese NIF en la cooperativa: ${partyName}.`);
  }
}

/** RN-FAC-04. */
export class DuplicateNumberError extends InvoicingApplicationError {
  readonly code = 'duplicate_number';

  constructor(what: 'albarán' | 'factura') {
    super(`Ya hay ${what === 'albarán' ? 'un albarán' : 'una factura'} con ese número.`);
  }
}
