/** Base class for business-rule violations of the announcements module. */
export abstract class AnnouncementDomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type ContentIssue = 'title_missing' | 'title_too_long' | 'body_missing' | 'body_too_long';

const ISSUE_TEXT: Record<ContentIssue, string> = {
  title_missing: 'falta el título',
  title_too_long: 'el título supera los 120 caracteres',
  body_missing: 'falta el cuerpo',
  body_too_long: 'el cuerpo supera los 5000 caracteres',
};

/** RN-COM-04, telling exactly what is wrong (HU-COM-01). */
export class InvalidAnnouncementError extends AnnouncementDomainError {
  readonly code = 'invalid_announcement';

  constructor(readonly issues: ContentIssue[]) {
    const text = issues.map((issue) => ISSUE_TEXT[issue]).join(' y ');
    super(`No se puede guardar el comunicado: ${text}.`);
  }
}

export class InvalidAnnouncementTransitionError extends AnnouncementDomainError {
  readonly code = 'invalid_announcement_transition';
}

export type AttachmentRejection = 'too_many' | 'not_pdf' | 'too_large';

const REJECTION_TEXT: Record<AttachmentRejection, string> = {
  too_many: 'Un comunicado admite como máximo 3 adjuntos.',
  not_pdf: 'Solo se admiten adjuntos en PDF.',
  too_large: 'Cada adjunto puede ocupar como máximo 10 MB.',
};

/** RN-COM-05. */
export class AttachmentRejectedError extends AnnouncementDomainError {
  readonly code = 'attachment_rejected';

  constructor(readonly reason: AttachmentRejection) {
    super(REJECTION_TEXT[reason]);
  }
}
