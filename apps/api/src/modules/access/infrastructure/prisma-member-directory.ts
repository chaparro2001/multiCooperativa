import type { PrismaClient } from '../../../shared/infrastructure/prisma';

/** Partner head counts (structurally the member area's `PartnerCensus`, ADR-025). */
export interface PartnerCensus {
  activePartners: number;
  invitedNotActivated: number;
  suspendedPartners: number;
  joinedInPeriod: number;
  leftInPeriod: number;
}

const nextDay = (day: string) =>
  new Date(new Date(`${day}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000);

/** A member as the member area shows them (requirements/06, US-MEM-01). */
export interface MemberRecord {
  membershipId: string;
  name: string;
  email: string;
  partnerNumber: string | null;
  /** Normalized tax id (ADR-025). */
  nif: string | null;
  isPartner: boolean;
  status: 'invited' | 'active' | 'suspended' | 'removed';
  profileName: string;
  /** The joining date; the membership's creation date when none was recorded. */
  joinedAt: Date;
}

const memberSelect = {
  id: true,
  status: true,
  isPartner: true,
  partnerNumber: true,
  nif: true,
  joinedAt: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
  profile: { select: { name: true } },
} as const;

type MemberRow = {
  id: string;
  status: MemberRecord['status'];
  isPartner: boolean;
  partnerNumber: string | null;
  nif: string | null;
  joinedAt: Date | null;
  createdAt: Date;
  user: { name: string; email: string };
  profile: { name: string };
};

const toMemberRecord = (row: MemberRow): MemberRecord => ({
  membershipId: row.id,
  name: row.user.name,
  email: row.user.email,
  partnerNumber: row.partnerNumber,
  nif: row.nif,
  isPartner: row.isPartner,
  status: row.status,
  profileName: row.profile.name,
  joinedAt: row.joinedAt ?? row.createdAt,
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

  /** ADR-025: partner head counts for the census; the joining date falls back to the creation date like the record's. */
  async partnerCensus(
    cooperativeId: string,
    period: { from?: string; to?: string },
  ): Promise<PartnerCensus> {
    // Dates are DATE columns (inclusive days); `createdAt` is an instant, so its end is exclusive.
    const days = (from?: string, to?: string) => ({
      ...(from && { gte: new Date(`${from}T00:00:00Z`) }),
      ...(to && { lte: new Date(`${to}T00:00:00Z`) }),
    });
    const instants = (from?: string, to?: string) => ({
      ...(from && { gte: new Date(`${from}T00:00:00Z`) }),
      ...(to && { lt: nextDay(to) }),
    });
    const bounded = Boolean(period.from || period.to);
    const partners = { cooperativeId, isPartner: true };
    const [activePartners, invitedNotActivated, suspendedPartners, joined, leftInPeriod] =
      await Promise.all([
        this.prisma.membership.count({ where: { ...partners, status: 'active' } }),
        this.prisma.membership.count({ where: { ...partners, status: 'invited' } }),
        this.prisma.membership.count({ where: { ...partners, status: 'suspended' } }),
        // Same fallback as the record: no joining date means the creation day.
        this.prisma.membership.count({
          where: {
            ...partners,
            ...(bounded && {
              OR: [
                { joinedAt: days(period.from, period.to) },
                { joinedAt: null, createdAt: instants(period.from, period.to) },
              ],
            }),
          },
        }),
        this.prisma.membership.count({
          where: {
            ...partners,
            status: 'removed',
            ...(bounded && { leftAt: days(period.from, period.to) }),
          },
        }),
      ]);
    return {
      activePartners,
      invitedNotActivated,
      suspendedPartners,
      joinedInPeriod: joined,
      leftInPeriod,
    };
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
