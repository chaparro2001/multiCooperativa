import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { AnnouncementState } from '../domain/announcement';
import type {
  AnnouncementListItem,
  AnnouncementRecord,
  AnnouncementStore,
  AttachmentRecord,
} from '../application/ports/announcement-store';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

const recordSelect = {
  id: true,
  cooperativeId: true,
  authorMembershipId: true,
  title: true,
  body: true,
  status: true,
  pinned: true,
  createdAt: true,
  publishedAt: true,
  editedAt: true,
} as const;

const attachmentSelect = { id: true, name: true, fileKey: true, size: true } as const;

const toData = (state: AnnouncementState) => ({
  title: state.title,
  body: state.body,
  status: state.status,
  pinned: state.pinned,
  publishedAt: state.publishedAt,
  editedAt: state.editedAt,
});

export class PrismaAnnouncementStore implements AnnouncementStore {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    cooperativeId: string,
    query: { onlyPublished: boolean; readerMembershipId: string; offset: number; limit: number },
  ): Promise<AnnouncementListItem[]> {
    const rows = await this.prisma.announcement.findMany({
      where: { cooperativeId, ...(query.onlyPublished && { status: 'publicado' }) },
      orderBy: [
        { pinned: 'desc' },
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      skip: query.offset,
      take: query.limit,
      select: {
        ...recordSelect,
        _count: { select: { attachments: true } },
        reads: { where: { membershipId: query.readerMembershipId }, select: { readAt: true } },
      },
    });
    return rows.map(({ _count, reads, ...row }) => ({
      ...row,
      attachmentCount: _count.attachments,
      read: reads.length > 0,
    }));
  }

  find(cooperativeId: string, id: string) {
    return this.prisma.announcement.findFirst({
      where: { id, cooperativeId },
      select: {
        ...recordSelect,
        attachments: { orderBy: { createdAt: 'asc' }, select: attachmentSelect },
      },
    });
  }

  create(
    cooperativeId: string,
    data: { authorMembershipId: string; state: AnnouncementState },
  ): Promise<AnnouncementRecord> {
    return this.prisma.announcement.create({
      data: { cooperativeId, authorMembershipId: data.authorMembershipId, ...toData(data.state) },
      select: recordSelect,
    });
  }

  update(
    cooperativeId: string,
    id: string,
    decide: (current: AnnouncementRecord) => AnnouncementState,
  ): Promise<AnnouncementRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, cooperativeId, id);
      if (!current) return null;
      return tx.announcement.update({
        where: { id },
        data: toData(decide(current)),
        select: recordSelect,
      });
    });
  }

  addAttachment(
    cooperativeId: string,
    id: string,
    check: (current: AnnouncementRecord, attachmentCount: number) => void,
    attachment: { name: string; fileKey: string; size: number },
  ): Promise<AttachmentRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lock(tx, cooperativeId, id);
      if (!current) return null;
      check(current, await tx.announcementAttachment.count({ where: { announcementId: id } }));
      return tx.announcementAttachment.create({
        data: { announcementId: id, ...attachment },
        select: attachmentSelect,
      });
    });
  }

  async recordRead(announcementId: string, membershipId: string, at: Date): Promise<void> {
    // The composite key makes it idempotent; the first read is kept (RN-COM-06).
    await this.prisma.announcementRead.createMany({
      data: [{ announcementId, membershipId, readAt: at }],
      skipDuplicates: true,
    });
  }

  countReads(announcementId: string): Promise<number> {
    return this.prisma.announcementRead.count({ where: { announcementId } });
  }

  /** Locks the row so concurrent changes (two uploads, publish twice) are serialized. */
  private async lock(
    tx: Transaction,
    cooperativeId: string,
    id: string,
  ): Promise<AnnouncementRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Announcement"
      WHERE id = ${id}::uuid AND "cooperativeId" = ${cooperativeId}::uuid
      FOR UPDATE`;
    if (locked.length === 0) return null;
    return tx.announcement.findUniqueOrThrow({ where: { id }, select: recordSelect });
  }
}
