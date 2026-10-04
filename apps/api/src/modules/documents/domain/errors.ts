/** Base class for business-rule violations of the documents module. */
export abstract class DocumentDomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
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
  not_pdf: 'Solo se admiten documentos en PDF.',
  too_large: 'El documento puede ocupar como máximo 20 MB.',
  empty: 'El fichero está vacío.',
};

/** RN-DOC-02, telling the reason (HU-DOC-01). */
export class DocumentFileRejectedError extends DocumentDomainError {
  readonly code = 'file_rejected';

  constructor(readonly reason: FileRejection) {
    super(REJECTION_TEXT[reason]);
  }
}
