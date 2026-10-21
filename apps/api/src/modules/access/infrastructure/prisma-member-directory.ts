import type { PrismaClient } from '../../../shared/infrastructure/prisma';

/** A member as the member area shows them (requirements/06, US-MEM-01). */
export interface MemberRecord {
  membershipId: string;
  name: string;
  email: string;
  partnerNumber: string | null;
  isPartner: boolean;
  status: 'invited' | 'active' | 'suspended' | 'removed';
  profileName: string;
  /** The membership's creation date: the joining date until the membership records its own. */
  joinedAt: Date;
}

const memberSelect = {
  id: true,
  status: true,
  isPartner: true,
  partnerNumber: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
  profile: { select: { name: true } },
} as const;

type MemberRow = {
  id: string;
  status: MemberRecord['status'];
  isPartner: boolean;
  partnerNumber: string | null;
  createdAt: Date;
  user: { name: string; email: string };
  profile: { name: string };
};

const toMemberRecord = (row: MemberRow): MemberRecord => ({
  membershipId: row.id,
  name: row.user.name,
  email: row.user.email,
  partnerNumber: row.partnerNumber,
  isPartner: row.isPartner,
  status: row.status,
  profileName: row.profile.name,
  joinedAt: row.createdAt,
});

/** Read-only member data other modules may need (author names, member counts). */
export class PrismaMemberDirectory {
  constructor(private readonly prisma: PrismaClient) {}

  /** Active memberships: the audience of announcements and the census of votes. */
  countActiveMembers(cooperativeId: string): Promise<number> {
    return this.prisma.membership.count({ where: { cooperativeId, status: 'active' } });
  }

  /** The cooperative's own tax id: tells sales from purchases in a scanned document (docs/requirements/05-invoices-and-delivery-notes.md, section 4). */
  async cooperativeTaxId(cooperativeId: string): Promise<string | null> {
    const cooperative = await this.prisma.cooperative.findUnique({
      where: { id: cooperativeId },
      select: { cif: true },
    });
    return cooperative?.cif ?? null;
  }

  /** BR-ASM-02: active memberships with partner status, the census of a voting. */
  async listVoters(cooperativeId: string): Promise<string[]> {
    const voters = await this.prisma.membership.findMany({
      where: { cooperativeId, status: 'active', isPartner: true },
      select: { id: true },
    });
    return voters.map((voter) => voter.id);
  }

  /** Names by membership id, only for memberships of this cooperative (any status: authorship stays, BR-ACC-14). */
  async displayNames(cooperativeId: string, membershipIds: string[]): Promise<Map<string, string>> {
    if (membershipIds.length === 0) return new Map();
    const memberships = await this.prisma.membership.findMany({
      where: { cooperativeId, id: { in: [...new Set(membershipIds)] } },
      select: { id: true, user: { select: { name: true } } },
    });
    return new Map(memberships.map((membership) => [membership.id, membership.user.name]));
  }

  /** One membership of this cooperative, any status; null if it belongs to another one. */
  async findMember(cooperativeId: string, membershipId: string): Promise<MemberRecord | null> {
    const row = await this.prisma.membership.findFirst({
      where: { id: membershipId, cooperativeId },
      select: memberSelect,
    });
    return row ? toMemberRecord(row) : null;
  }

  /** The cooperative's partners that have not left (BR-ACC-14), by partner number: who holds share capital. */
  async listPartners(cooperativeId: string): Promise<MemberRecord[]> {
    const rows = await this.prisma.membership.findMany({
      where: { cooperativeId, isPartner: true, status: { not: 'removed' } },
      select: memberSelect,
    });
    return rows
      .map(toMemberRecord)
      .sort(
        (a, b) =>
          (a.partnerNumber ?? '').localeCompare(b.partnerNumber ?? '', 'en', { numeric: true }) ||
          a.name.localeCompare(b.name),
      );
  }
}
