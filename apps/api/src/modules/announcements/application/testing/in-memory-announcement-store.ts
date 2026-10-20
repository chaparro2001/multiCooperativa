import type { AnnouncementState } from '../../domain/announcement';
import type {
  AnnouncementListItem,
  AnnouncementRecord,
  AnnouncementStore,
  AttachmentRecord,
} from '../ports/announcement-store';

/** Test double with the same ordering and scoping rules as the Prisma store. */
export class InMemoryAnnouncementStore implements AnnouncementStore {
  readonly rows: (AnnouncementRecord & { attachments: AttachmentRecord[] })[] = [];
  readonly reads = new Map<string, Date>();
  private nextId = 1;

  private id() {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  async list(
    cooperativeId: string,
    query: { onlyPublished: boolean; readerMembershipId: string; offset: number; limit: number },
  ): Promise<AnnouncementListItem[]> {
    // Same as SQL: pinned, then publishedAt desc with drafts (null) last, then createdAt desc.
    const published = (row: AnnouncementRecord) => row.publishedAt?.getTime() ?? -Infinity;
    return this.rows
      .filter((row) => row.cooperativeId === cooperativeId)
      .filter((row) => !query.onlyPublished || row.status === 'published')
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          published(b) - published(a) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(query.offset, query.offset + query.limit)
      .map(({ attachments, ...row }) => ({
        ...row,
        attachmentCount: attachments.length,
        read: this.reads.has(`${row.id}:${query.readerMembershipId}`),
      }));
  }

  async find(cooperativeId: string, id: string) {
    const row = this.rows.find((r) => r.id === id && r.cooperativeId === cooperativeId);
    return row ? { ...row, attachments: [...row.attachments] } : null;
  }

  async create(
    cooperativeId: string,
    data: { authorMembershipId: string; state: AnnouncementState },
  ): Promise<AnnouncementRecord> {
    const row = {
      id: this.id(),
      cooperativeId,
      authorMembershipId: data.authorMembershipId,
      createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, this.nextId)),
      ...data.state,
      attachments: [],
    };
    this.rows.push(row);
    const { attachments: _attachments, ...record } = row;
    return record;
  }

  async update(
    cooperativeId: string,
    id: string,
    decide: (current: AnnouncementRecord) => AnnouncementState,
  ) {
    const row = this.rows.find((r) => r.id === id && r.cooperativeId === cooperativeId);
    if (!row) return null;
    const { attachments: _attachments, ...current } = row;
    Object.assign(row, decide(current));
    const { attachments: _after, ...record } = row;
    return record;
  }

  async addAttachment(
    cooperativeId: string,
    id: string,
    check: (current: AnnouncementRecord, attachmentCount: number) => void,
    attachment: { name: string; fileKey: string; size: number },
  ) {
    const row = this.rows.find((r) => r.id === id && r.cooperativeId === cooperativeId);
    if (!row) return null;
    const { attachments, ...current } = row;
    check(current, attachments.length);
    const stored = { id: this.id(), ...attachment };
    attachments.push(stored);
    return stored;
  }

  async recordRead(announcementId: string, membershipId: string, at: Date) {
    const key = `${announcementId}:${membershipId}`;
    if (!this.reads.has(key)) this.reads.set(key, at);
  }

  async countReads(announcementId: string) {
    return [...this.reads.keys()].filter((key) => key.startsWith(`${announcementId}:`)).length;
  }
}
