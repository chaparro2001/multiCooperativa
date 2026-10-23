import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { PageRequest } from '../../../shared/pagination';
import type {
  AuditInput,
  AuditRecord,
  MemberFilter,
  MemberRecord,
  MemberSnapshot,
  MemberStore,
  MemberUpdate,
  NewInvitation,
  ProfileRecord,
} from '../application/ports/member-store';
import { MemberNifTakenError } from '../application/errors';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** A profile is an administrator profile when it manages users and profiles (BR-ACC-07). */
const MANAGES_USERS = { module: 'users', level: 'manage' } as const;

const memberSelect = {
  id: true,
  status: true,
  isPartner: true,
  partnerNumber: true,
  nif: true,
  user: { select: { id: true, email: true, name: true } },
  profile: {
    select: {
      id: true,
      name: true,
      permissions: { where: MANAGES_USERS, select: { module: true } },
    },
  },
} as const;

type MemberRow = {
  id: string;
  status: MemberRecord['status'];
  isPartner: boolean;
  partnerNumber: string | null;
  nif: string | null;
  user: { id: string; email: string; name: string };
  profile: { id: string; name: string; permissions: { module: string }[] };
};

function toMember(row: MemberRow): MemberRecord {
  return {
    membershipId: row.id,
    userId: row.user.id,
    email: row.user.email,
    name: row.user.name,
    profileId: row.profile.id,
    profileName: row.profile.name,
    isAdmin: row.profile.permissions.length > 0,
    status: row.status,
    isPartner: row.isPartner,
    partnerNumber: row.partnerNumber,
    nif: row.nif,
  };
}

const ACCENTED = 'áàäâãéèëêíìïîóòöôõúùüûñç';
const PLAIN = 'aaaaaeeeeiiiiooooouuuunc';

/** Lower case without diacritics: the text the search compares (the SQL side translates the same letters). */
const foldAccents = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/** Thrown inside a transaction to roll it back without it being a failure. */
class AlreadyMember extends Error {}
class NifTaken extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

export class PrismaMemberStore implements MemberStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listMembers(
    cooperativeId: string,
    filter: MemberFilter,
    page: PageRequest,
  ): Promise<MemberRecord[]> {
    const matching = filter.search?.trim()
      ? await this.searchIds(cooperativeId, filter.search)
      : null;
    const [name, id] = page.cursor ?? [];
    const rows = await this.prisma.membership.findMany({
      where: {
        cooperativeId,
        status: filter.status ?? { not: 'removed' },
        ...(matching && { id: { in: matching } }),
        // After the cursor [name, id] of (name asc, id asc). The user's name is not unique.
        ...(name !== undefined &&
          id !== undefined && {
            AND: [
              {
                OR: [{ user: { name: { gt: name } } }, { user: { name }, id: { gt: id } }],
              },
            ],
          }),
      },
      orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
      take: page.limit,
      select: memberSelect,
    });
    return rows.map(toMember);
  }

  /**
   * Memberships of the cooperative whose name or email contains the text, ignoring case and
   * accents ("jose" finds "José"): the same search the app did on the whole list. Prisma cannot
   * fold accents, so a bounded raw query (one cooperative's memberships) picks the ids.
   */
  private async searchIds(cooperativeId: string, text: string): Promise<string[]> {
    const pattern = `%${foldAccents(text).replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT m.id FROM "Membership" m JOIN "User" u ON u.id = m."userId"
      WHERE m."cooperativeId" = ${cooperativeId}::uuid AND m.status <> 'removed'
        AND (translate(lower(u.name), ${ACCENTED}, ${PLAIN}) LIKE ${pattern}
          OR translate(lower(u.email), ${ACCENTED}, ${PLAIN}) LIKE ${pattern})`;
    return rows.map((row) => row.id);
  }

  async findMember(cooperativeId: string, membershipId: string): Promise<MemberRecord | null> {
    const row = await this.prisma.membership.findFirst({
      where: { id: membershipId, cooperativeId, status: { not: 'removed' } },
      select: memberSelect,
    });
    return row && toMember(row);
  }

  async listProfiles(cooperativeId: string): Promise<ProfileRecord[]> {
    const rows = await this.prisma.profile.findMany({
      where: { cooperativeId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, predefined: true, permissions: { where: MANAGES_USERS } },
    });
    return rows.map(({ permissions, ...profile }) => ({
      ...profile,
      isAdmin: permissions.length > 0,
    }));
  }

  async findProfile(cooperativeId: string, profileId: string): Promise<ProfileRecord | null> {
    const row = await this.prisma.profile.findFirst({
      where: { id: profileId, cooperativeId },
      select: { id: true, name: true, predefined: true, permissions: { where: MANAGES_USERS } },
    });
    if (!row) return null;
    const { permissions, ...profile } = row;
    return { ...profile, isAdmin: permissions.length > 0 };
  }

  async createInvitedMember(
    cooperativeId: string,
    data: {
      email: string;
      name: string;
      profileId: string;
      isPartner: boolean;
      partnerNumber: string | null;
      nif: string | null;
      invitation: NewInvitation;
      audit: AuditInput;
    },
  ): Promise<{ membershipId: string; userId: string } | 'already_member' | 'nif_taken'> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // An existing user (another cooperative, or a former member) keeps their account.
        const user = await tx.user.upsert({
          where: { email: data.email },
          create: { email: data.email, name: data.name },
          update: {},
          select: { id: true },
        });
        const live = await tx.membership.count({
          where: { userId: user.id, cooperativeId, status: { not: 'removed' } },
        });
        if (live > 0) throw new AlreadyMember();
        if (data.nif && (await this.nifInUse(tx, cooperativeId, data.nif))) throw new NifTaken();

        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            cooperativeId,
            profileId: data.profileId,
            isPartner: data.isPartner,
            partnerNumber: data.partnerNumber,
            nif: data.nif,
            invitation: { create: data.invitation },
          },
          select: { id: true },
        });
        await this.audit(tx, cooperativeId, user.id, data.audit);
        return { membershipId: membership.id, userId: user.id };
      });
    } catch (error) {
      // The partial unique index (BR-ACC-02) settles two simultaneous invitations.
      if (error instanceof NifTaken) return 'nif_taken';
      if (error instanceof AlreadyMember) return 'already_member';
      if (isUniqueViolation(error)) {
        // Two unique keys can fire: tell the NIF one from the user one.
        const nifTaken = data.nif && (await this.nifInUse(this.prisma, cooperativeId, data.nif));
        return nifTaken ? 'nif_taken' : 'already_member';
      }
      throw error;
    }
  }

  updateMember(
    cooperativeId: string,
    membershipId: string,
    decide: (snapshot: MemberSnapshot) => MemberUpdate,
  ): Promise<MemberRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // Serializes membership changes per cooperative: the admin count read below
      // cannot go stale before the update commits (BR-ACC-07).
      await tx.$queryRaw`SELECT id FROM "Cooperative" WHERE id = ${cooperativeId}::uuid FOR UPDATE`;

      const row = await tx.membership.findFirst({
        where: { id: membershipId, cooperativeId },
        select: memberSelect,
      });
      if (!row) return null;

      const activeAdminCount = await tx.membership.count({
        where: {
          cooperativeId,
          status: 'active',
          profile: { permissions: { some: MANAGES_USERS } },
        },
      });
      const member = toMember(row);
      const update = decide({ member, activeAdminCount });

      if (update.nif && (await this.nifInUse(tx, cooperativeId, update.nif, membershipId))) {
        throw new MemberNifTakenError();
      }
      if (update.status || update.profileId || update.nif !== undefined) {
        try {
          await tx.membership.update({
            where: { id: membershipId },
            data: {
              status: update.status,
              profileId: update.profileId,
              nif: update.nif,
              // The day it left, for the census (ADR-025).
              ...(update.status === 'removed' && { leftAt: new Date() }),
            },
          });
        } catch (error) {
          if (isUniqueViolation(error)) throw new MemberNifTakenError();
          throw error;
        }
      }
      if (update.invitation) {
        await tx.invitation.upsert({
          where: { membershipId },
          create: { membershipId, ...update.invitation },
          update: { ...update.invitation, usedAt: null },
        });
      }
      await this.audit(tx, cooperativeId, member.userId, update.audit);

      return toMember(
        await tx.membership.findUniqueOrThrow({
          where: { id: membershipId },
          select: memberSelect,
        }),
      );
    });
  }

  /** A live membership of the cooperative already holds this NIF (ADR-025); `except` skips the member being edited. */
  private async nifInUse(
    db: Pick<PrismaClient, 'membership'>,
    cooperativeId: string,
    nif: string,
    except?: string,
  ): Promise<boolean> {
    const count = await db.membership.count({
      where: {
        cooperativeId,
        nif,
        status: { not: 'removed' },
        ...(except && { id: { not: except } }),
      },
    });
    return count > 0;
  }

  async listAudit(cooperativeId: string, limit: number): Promise<AuditRecord[]> {
    return this.prisma.auditEvent.findMany({
      where: { cooperativeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        targetUserId: true,
        detail: true,
        createdAt: true,
      },
    });
  }

  async recordAudit(cooperativeId: string, targetUserId: string, audit: AuditInput): Promise<void> {
    await this.audit(this.prisma, cooperativeId, targetUserId, audit);
  }

  private async audit(
    tx: Transaction,
    cooperativeId: string,
    targetUserId: string,
    audit: AuditInput,
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        cooperativeId,
        targetUserId,
        actorUserId: audit.actorUserId,
        action: audit.action,
        detail: audit.detail as object,
      },
    });
  }
}
