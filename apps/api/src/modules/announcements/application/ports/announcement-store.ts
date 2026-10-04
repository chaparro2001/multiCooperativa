import type { AnnouncementState } from '../../domain/announcement';

export interface AnnouncementRecord extends AnnouncementState {
  id: string;
  cooperativeId: string;
  authorMembershipId: string;
  createdAt: Date;
}

export interface AttachmentRecord {
  id: string;
  name: string;
  fileKey: string;
  size: number;
}

export interface AnnouncementListItem extends AnnouncementRecord {
  attachmentCount: number;
  /** Read by the membership that asks (HU-COM-02). */
  read: boolean;
}

/** Every method is scoped to one cooperative (ADR-003). */
export interface AnnouncementStore {
  /** Pinned first, then newest; drafts by creation date. */
  list(
    cooperativeId: string,
    query: { onlyPublished: boolean; readerMembershipId: string; offset: number; limit: number },
  ): Promise<AnnouncementListItem[]>;
  find(
    cooperativeId: string,
    id: string,
  ): Promise<(AnnouncementRecord & { attachments: AttachmentRecord[] }) | null>;
  create(
    cooperativeId: string,
    data: { authorMembershipId: string; state: AnnouncementState },
  ): Promise<AnnouncementRecord>;
  /**
   * Locked read-modify-write: `decide` receives the current state and returns
   * the next one. Null if the announcement does not exist in this cooperative.
   */
  update(
    cooperativeId: string,
    id: string,
    decide: (current: AnnouncementRecord) => AnnouncementState,
  ): Promise<AnnouncementRecord | null>;
  /**
   * Locked like `update`: `check` sees the state and the current number of
   * attachments and throws to refuse. Null if the announcement does not exist.
   */
  addAttachment(
    cooperativeId: string,
    id: string,
    check: (current: AnnouncementRecord, attachmentCount: number) => void,
    attachment: { name: string; fileKey: string; size: number },
  ): Promise<AttachmentRecord | null>;
  /** RN-COM-06: idempotent, the first read is the one kept. */
  recordRead(announcementId: string, membershipId: string, at: Date): Promise<void>;
  countReads(announcementId: string): Promise<number>;
}
