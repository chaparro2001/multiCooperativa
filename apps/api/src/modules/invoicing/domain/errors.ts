/** Base class for business-rule violations of the invoicing module. */
export abstract class InvoicingDomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidAmountError extends InvoicingDomainError {
  readonly code = 'invalid_amount';
}

/** RN-FAC-07: tells the expected total and the difference (HU-FAC-03). */
export class TotalMismatchError extends InvoicingDomainError {
  readonly code = 'total_mismatch';

  constructor(
    readonly expected: string,
    readonly difference: string,
  ) {
    super(
      `El total no cuadra con base más IVA: debería ser ${expected} € (diferencia ${difference.replace('-', '')} €).`,
    );
  }
}

export class InvalidThirdPartyError extends InvoicingDomainError {
  readonly code = 'invalid_third_party';
}

export class InvalidDocumentError extends InvoicingDomainError {
  readonly code = 'invalid_document';
}

export class InvalidInvoiceTransitionError extends InvoicingDomainError {
  readonly code = 'invalid_invoice_transition';
}
