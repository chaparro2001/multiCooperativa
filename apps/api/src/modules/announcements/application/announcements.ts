import { type CooperativeContext, hasAccess, requireAccess } from '../../access';
import type { EventPublisher } from '../../../shared/events';
import { type FileStorage, newFileKey } from '../../../shared/files/file-storage';
import { isPdf } from '../../../shared/domain/pdf';
import {
  type AnnouncementState,
  assertCanAttach,
  createDraft,
  edit,
  isVisible,
  publish,
  setPinned,
  withdraw,
} from '../domain/announcement';
import { AnnouncementNotFoundError } from './errors';
import type { AnnouncementEvent } from './events';
import type {
  AnnouncementListItem,
  AnnouncementRecord,
  AnnouncementStore,
  AttachmentRecord,
} from './ports/announcement-store';
import type { MemberDirectory } from './ports/member-directory';

export const PAGE_SIZE = 20;
const PDF = 'application/pdf';

export interface AnnouncementDeps {
  announcements: AnnouncementStore;
  members: MemberDirectory;
  files: FileStorage;
  events: EventPublisher<AnnouncementEvent>;
  now: () => Date;
}

const canManage = (context: CooperativeContext) =>
  hasAccess(context.permissions, 'comunicados', 'gestion');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findVisible(deps: AnnouncementDeps, context: CooperativeContext, id: string) {
  const announcement = UUID.test(id)
    ? await deps.announcements.find(context.cooperativeId, id)
    : null;
  if (!announcement || !isVisible(announcement.status, canManage(context))) {
    throw new AnnouncementNotFoundError();
  }
  return announcement;
}

async function updateOrFail(
  deps: AnnouncementDeps,
  context: CooperativeContext,
  id: string,
  decide: (current: AnnouncementRecord) => AnnouncementState,
): Promise<AnnouncementRecord> {
  const updated = UUID.test(id)
    ? await deps.announcements.update(context.cooperativeId, id, decide)
    : null;
  if (!updated) throw new AnnouncementNotFoundError();
  return updated;
}

export interface AnnouncementPage {
  items: (AnnouncementListItem & { authorName: string | null })[];
  nextOffset: number | null;
}

/** HU-COM-02. */
export async function listAnnouncements(
  deps: AnnouncementDeps,
  context: CooperativeContext,
  offset: number,
): Promise<AnnouncementPage> {
  requireAccess(context.permissions, 'comunicados', 'consulta');
  // One extra row tells whether there is a next page.
  const rows = await deps.announcements.list(context.cooperativeId, {
    onlyPublished: !canManage(context),
    readerMembershipId: context.membershipId,
    offset,
    limit: PAGE_SIZE + 1,
  });
  const page = rows.slice(0, PAGE_SIZE);
  const names = await deps.members.displayNames(
    context.cooperativeId,
    page.map((row) => row.authorMembershipId),
  );
  return {
    items: page.map((row) => ({ ...row, authorName: names.get(row.authorMembershipId) ?? null })),
    nextOffset: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
  };
}

export interface AnnouncementDetail extends AnnouncementRecord {
  authorName: string | null;
  attachments: (Omit<AttachmentRecord, 'fileKey'> & { url: string })[];
  /** HU-COM-07, only for «gestión» and once published. */
  readStats: { readCount: number; activeMembers: number } | null;
}

/** HU-COM-03: opening a published announcement marks it as read. */
export async function getAnnouncement(
  deps: AnnouncementDeps,
  context: CooperativeContext,
  id: string,
): Promise<AnnouncementDetail> {
  requireAccess(context.permissions, 'comunicados', 'consulta');
  const announcement = await findVisible(deps, context, id);

  if (announcement.status === 'publicado') {
    await deps.announcements.recordRead(announcement.id, context.membershipId, deps.now());
  }

  const [names, attachments, readStats] = await Promise.all([
    deps.members.displayNames(context.cooperativeId, [announcement.authorMembershipId]),
    Promise.all(
      announcement.attachments.map(async ({ fileKey, ...attachment }) => ({
        ...attachment,
        url: await deps.files.signedDownloadUrl(fileKey, {
          fileName: attachment.name,
          contentType: PDF,
        }),
      })),
    ),
    canManage(context) && announcement.status !== 'borrador'
      ? Promise.all([
          deps.announcements.countReads(announcement.id),
          deps.members.countActiveMembers(context.cooperativeId),
        ]).then(([readCount, activeMembers]) => ({ readCount, activeMembers }))
      : Promise.resolve(null),
  ]);

  const { attachments: _attachments, ...record } = announcement;
  return {
    ...record,
    authorName: names.get(announcement.authorMembershipId) ?? null,
    attachments,
    readStats,
  };
}

/** HU-COM-01: saving creates a draft visible only with «gestión». */
export async function createAnnouncement(
  deps: AnnouncementDeps,
  context: CooperativeContext,
  input: { title: string; body: string },
): Promise<AnnouncementRecord> {
  requireAccess(context.permissions, 'comunicados', 'gestion');
  return deps.announcements.create(context.cooperativeId, {
    authorMembershipId: context.membershipId,
    state: createDraft(input),
  });
}

/** HU-COM-05 (edit) and HU-COM-06 (pin). */
export async function updateAnnouncement(
  deps: AnnouncementDeps,
  context: CooperativeContext,
  id: string,
  changes: { title?: string; body?: string; pinned?: boolean },
): Promise<AnnouncementRecord> {
  requireAccess(context.permissions, 'comunicados', 'gestion');
  return updateOrFail(deps, context, id, (current) => {
    let next: AnnouncementState = current;
    if (changes.title !== undefined || changes.body !== undefined) {
      next = edit(next, { title: changes.title, body: changes.body }, deps.now());
    }
    if (changes.pinned !== undefined) next = setPinned(next, changes.pinned);
    return next;
  });
}

/** HU-COM-01: publishes and emits `ComunicadoPublicado` once (RN-COM-07). */
export async function publishAnnouncement(
  deps: AnnouncementDeps,
  context: CooperativeContext,
  id: string,
): Promise<AnnouncementRecord> {
  requireAccess(context.permissions, 'comunicados', 'gestion');
  const now = deps.now();
  const published = await updateOrFail(deps, context, id, (current) => publish(current, now));

  // After the commit: a subscriber never sees an announcement that is not stored yet.
  await deps.events.publish({
    type: 'ComunicadoPublicado',
    occurredAt: now,
    payload: {
      cooperativeId: context.cooperativeId,
      announcementId: published.id,
      title: published.title,
    },
  });
  return published;
}

/** HU-COM-05. */
export async function withdrawAnnouncement(
  deps: AnnouncementDeps,
  context: CooperativeContext,
  id: string,
): Promise<AnnouncementRecord> {
  requireAccess(context.permissions, 'comunicados', 'gestion');
  return updateOrFail(deps, context, id, (current) => withdraw(current));
}

/** RN-COM-05: up to 3 PDF of 10 MB, checked by content before and again under lock. */
export async function addAttachment(
  deps: AnnouncementDeps,
  context: CooperativeContext,
  id: string,
  file: { name: string; content: Uint8Array },
): Promise<Omit<AttachmentRecord, 'fileKey'>> {
  requireAccess(context.permissions, 'comunicados', 'gestion');
  const announcement = await findVisible(deps, context, id);
  const facts = { size: file.content.byteLength, isPdf: isPdf(file.content) };
  // Early, so a refused file is never uploaded.
  assertCanAttach(announcement, announcement.attachments.length, facts);

  const fileKey = newFileKey(context.cooperativeId, 'comunicados');
  await deps.files.put(fileKey, file.content, PDF);
  try {
    const stored = await deps.announcements.addAttachment(
      context.cooperativeId,
      id,
      (current, count) => assertCanAttach(current, count, facts),
      { name: file.name, fileKey, size: facts.size },
    );
    if (!stored) throw new AnnouncementNotFoundError();
    const { fileKey: _key, ...attachment } = stored;
    return attachment;
  } catch (error) {
    // Refused under lock (e.g. a parallel upload took the third slot): no orphan file.
    await deps.files.delete(fileKey).catch(() => undefined);
    throw error;
  }
}
