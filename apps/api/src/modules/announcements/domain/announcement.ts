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

/** RN-COM-02: a published announcement is never deleted, it is withdrawn. */
export const ANNOUNCEMENT_STATUSES = ['borrador', 'publicado', 'retirado'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export interface AnnouncementState {
  readonly status: AnnouncementStatus;
  readonly title: string;
  /** Plain text: shown as is, never interpreted as HTML (RNF-COM-02). */
  readonly body: string;
  readonly pinned: boolean;
  readonly publishedAt: Date | null;
  readonly editedAt: Date | null;
}

interface Content {
  title: string;
  body: string;
}

/** Lengths always; presence only when it has to be readable by everyone (RN-COM-04). */
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

/** HU-COM-01: a draft may be incomplete; only publishing requires title and body. */
export function createDraft(content: Content): AnnouncementState {
  const normalized = normalize(content);
  assertContent(normalized, false);
  return { status: 'borrador', ...normalized, pinned: false, publishedAt: null, editedAt: null };
}

/** HU-COM-01. Only from draft: the notice is sent once (RN-COM-07). */
export function publish<T extends AnnouncementState>(announcement: T, now: Date): T {
  if (announcement.status !== 'borrador') {
    throw new InvalidAnnouncementTransitionError('Solo se puede publicar un borrador.');
  }
  assertContent(announcement, true);
  return { ...announcement, status: 'publicado', publishedAt: now };
}

/** HU-COM-05: edits to a published announcement are visible as such and send no new push. */
export function edit<T extends AnnouncementState>(
  announcement: T,
  changes: Partial<Content>,
  now: Date,
): T {
  if (announcement.status === 'retirado') {
    throw new InvalidAnnouncementTransitionError('Un comunicado retirado no se puede editar.');
  }
  const content = normalize({
    title: changes.title ?? announcement.title,
    body: changes.body ?? announcement.body,
  });
  const isPublished = announcement.status === 'publicado';
  assertContent(content, isPublished);
  return { ...announcement, ...content, editedAt: isPublished ? now : announcement.editedAt };
}

/** HU-COM-05. */
export function withdraw<T extends AnnouncementState>(announcement: T): T {
  if (announcement.status !== 'publicado') {
    throw new InvalidAnnouncementTransitionError('Solo se puede retirar un comunicado publicado.');
  }
  return { ...announcement, status: 'retirado', pinned: false };
}

/** HU-COM-06. */
export function setPinned<T extends AnnouncementState>(announcement: T, pinned: boolean): T {
  if (announcement.status !== 'publicado') {
    throw new InvalidAnnouncementTransitionError('Solo se puede fijar un comunicado publicado.');
  }
  return { ...announcement, pinned };
}

/** RN-COM-03: with «consulta» only published announcements exist. */
export function isVisible(status: AnnouncementStatus, canManage: boolean): boolean {
  return canManage || status === 'publicado';
}

/** RN-COM-05: up to 3 PDF attachments of 10 MB each. */
export function assertCanAttach(
  announcement: AnnouncementState,
  currentCount: number,
  file: { size: number; isPdf: boolean },
): void {
  if (announcement.status === 'retirado') {
    throw new InvalidAnnouncementTransitionError('No se puede adjuntar a un comunicado retirado.');
  }
  if (currentCount >= MAX_ATTACHMENTS) throw new AttachmentRejectedError('too_many');
  if (!file.isPdf) throw new AttachmentRejectedError('not_pdf');
  if (file.size > MAX_ATTACHMENT_BYTES) throw new AttachmentRejectedError('too_large');
}
