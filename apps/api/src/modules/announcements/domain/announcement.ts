import {
  AttachmentRejectedError,
  type ContentIssue,
  InvalidAnnouncementError,
  InvalidAnnouncementTransitionError,
} from './errors';

export const TITLE_MAX_LENGTH = 120;
export const BODY_MAX_LENGTH = 5000;
export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** BR-ANN-02: a published announcement is never deleted, it is withdrawn. */
export const ANNOUNCEMENT_STATUSES = ['draft', 'published', 'withdrawn'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export interface AnnouncementState {
  readonly status: AnnouncementStatus;
  readonly title: string;
  /** Plain text: shown as is, never interpreted as HTML (NFR-ANN-02). */
  readonly body: string;
  readonly pinned: boolean;
  readonly publishedAt: Date | null;
  readonly editedAt: Date | null;
}

interface Content {
  title: string;
  body: string;
}

/** Lengths always; presence only when it has to be readable by everyone (BR-ANN-04). */
function contentIssues(content: Content, complete: boolean): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (complete && content.title.length === 0) issues.push('title_missing');
  if (content.title.length > TITLE_MAX_LENGTH) issues.push('title_too_long');
  if (complete && content.body.length === 0) issues.push('body_missing');
  if (content.body.length > BODY_MAX_LENGTH) issues.push('body_too_long');
  return issues;
}

function assertContent(content: Content, complete: boolean): void {
  const issues = contentIssues(content, complete);
  if (issues.length > 0) throw new InvalidAnnouncementError(issues);
}

const normalize = (content: Content): Content => ({
  title: content.title.trim(),
  body: content.body.trim(),
});

/** US-ANN-01: a draft may be incomplete; only publishing requires title and body. */
export function createDraft(content: Content): AnnouncementState {
  const normalized = normalize(content);
  assertContent(normalized, false);
  return { status: 'draft', ...normalized, pinned: false, publishedAt: null, editedAt: null };
}

/** US-ANN-01. Only from draft: the notice is sent once (BR-ANN-07). */
export function publish<T extends AnnouncementState>(announcement: T, now: Date): T {
  if (announcement.status !== 'draft') {
    throw new InvalidAnnouncementTransitionError('Only a draft can be published.');
  }
  assertContent(announcement, true);
  return { ...announcement, status: 'published', publishedAt: now };
}

/** US-ANN-05: edits to a published announcement are visible as such and send no new push. */
export function edit<T extends AnnouncementState>(
  announcement: T,
  changes: Partial<Content>,
  now: Date,
): T {
  if (announcement.status === 'withdrawn') {
    throw new InvalidAnnouncementTransitionError('A withdrawn announcement cannot be edited.');
  }
  const content = normalize({
    title: changes.title ?? announcement.title,
    body: changes.body ?? announcement.body,
  });
  const isPublished = announcement.status === 'published';
  assertContent(content, isPublished);
  return { ...announcement, ...content, editedAt: isPublished ? now : announcement.editedAt };
}

/** US-ANN-05. */
export function withdraw<T extends AnnouncementState>(announcement: T): T {
  if (announcement.status !== 'published') {
    throw new InvalidAnnouncementTransitionError('Only a published announcement can be withdrawn.');
  }
  return { ...announcement, status: 'withdrawn', pinned: false };
}

/** US-ANN-06. */
export function setPinned<T extends AnnouncementState>(announcement: T, pinned: boolean): T {
  if (announcement.status !== 'published') {
    throw new InvalidAnnouncementTransitionError('Only a published announcement can be pinned.');
  }
  return { ...announcement, pinned };
}

/** BR-ANN-03: with "read" only published announcements exist. */
export function isVisible(status: AnnouncementStatus, canManage: boolean): boolean {
  return canManage || status === 'published';
}

/** BR-ANN-05: up to 3 PDF attachments of 10 MB each. */
export function assertCanAttach(
  announcement: AnnouncementState,
  currentCount: number,
  file: { size: number; isPdf: boolean },
): void {
  if (announcement.status === 'withdrawn') {
    throw new InvalidAnnouncementTransitionError('Cannot attach to a withdrawn announcement.');
  }
  if (currentCount >= MAX_ATTACHMENTS) throw new AttachmentRejectedError('too_many');
  if (!file.isPdf) throw new AttachmentRejectedError('not_pdf');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new AttachmentRejectedError('too_large');
}
