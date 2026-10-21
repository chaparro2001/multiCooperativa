/** Base class for business-rule violations of the invoicing module. */
export abstract class InvoicingDomainError extends Error {
  abstract readonly code: string;

  /**
   * Contract path of the input field the rule is about (`nif`, `dueDate`, `lines.0.quantity`),
   * sent as `details.field` so the app marks that field. Absent when it is not about one.
   */
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
    this.name = new.target.name;
  }
}

export class InvalidAmountError extends InvoicingDomainError {
  readonly code = 'invalid_amount';
}

/** BR-INV-07: tells the expected total and the difference (US-INV-03). */
export class TotalMismatchError extends InvoicingDomainError {
  readonly code = 'total_mismatch';

  constructor(
    readonly expected: string,
    readonly difference: string,
  ) {
    super(
      `The total does not match base plus VAT: it should be ${expected} € (difference ${difference.replace('-', '')} €).`,
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
