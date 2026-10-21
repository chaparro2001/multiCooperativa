/** Base class for business-rule violations of the documents module. */
export abstract class DocumentDomainError extends Error {
  abstract readonly code: string;

  /** Contract path of the input field the rule is about, sent as `details.field`. */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
    this.name = new.target.name;
  }
}

export class InvalidDocumentError extends DocumentDomainError {
  readonly code = 'invalid_document';
}

export class InvalidDocumentTransitionError extends DocumentDomainError {
  readonly code = 'invalid_document_transition';
}

export type FileRejection = 'not_pdf' | 'too_large' | 'empty';

const REJECTION_TEXT: Record<FileRejection, string> = {
  not_pdf: 'Only PDF documents are accepted.',
  too_large: 'The document can be at most 20 MB.',
  empty: 'The file is empty.',
};

/** BR-DOC-02, telling the reason (US-DOC-01). */
export class DocumentFileRejectedError extends DocumentDomainError {
  readonly code = 'file_rejected';

  constructor(readonly reason: FileRejection) {
    super(REJECTION_TEXT[reason]);
  }
}
