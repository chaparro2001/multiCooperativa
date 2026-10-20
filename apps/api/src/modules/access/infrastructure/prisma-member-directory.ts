import type { PrismaClient } from '../../../shared/infrastructure/prisma';

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
}
