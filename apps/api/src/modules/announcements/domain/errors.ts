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
  title_missing: 'title is missing',
  title_too_long: 'title exceeds 120 characters',
  body_missing: 'body is missing',
  body_too_long: 'body exceeds 5000 characters',
};

/** BR-ANN-04, telling exactly what is wrong (US-ANN-01). */
export class InvalidAnnouncementError extends AnnouncementDomainError {
  readonly code = 'invalid_announcement';

  constructor(readonly issues: ContentIssue[]) {
    const text = issues.map((issue) => ISSUE_TEXT[issue]).join(' and ');
    super(`Cannot save the announcement: ${text}.`);
  }
}

export class InvalidAnnouncementTransitionError extends AnnouncementDomainError {
  readonly code = 'invalid_announcement_transition';
}

export type AttachmentRejection = 'too_many' | 'not_pdf' | 'too_large';

const REJECTION_TEXT: Record<AttachmentRejection, string> = {
  too_many: 'An announcement accepts at most 3 attachments.',
  not_pdf: 'Only PDF attachments are accepted.',
  too_large: 'Each attachment can be at most 10 MB.',
};

/** BR-ANN-05. */
export class AttachmentRejectedError extends AnnouncementDomainError {
  readonly code = 'attachment_rejected';

  constructor(readonly reason: AttachmentRejection) {
    super(REJECTION_TEXT[reason]);
  }
}
