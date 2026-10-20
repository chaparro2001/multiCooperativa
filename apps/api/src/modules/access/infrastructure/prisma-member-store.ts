import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type {
  AuditInput,
  AuditRecord,
  MemberRecord,
  MemberSnapshot,
  MemberStore,
  MemberUpdate,
  NewInvitation,
  ProfileRecord,
} from '../application/ports/member-store';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** A profile is an administrator profile when it manages users and profiles (BR-ACC-07). */
const MANAGES_USERS = { module: 'users', level: 'manage' } as const;

const memberSelect = {
  id: true,
  status: true,
  isPartner: true,
  partnerNumber: true,
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
  };
}

/** Thrown inside a transaction to roll it back without it being a failure. */
class AlreadyMember extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'P2002';
}

export class PrismaMemberStore implements MemberStore {
  constructor(private readonly prisma: PrismaClient) {}

  async listMembers(cooperativeId: string): Promise<MemberRecord[]> {
    const rows = await this.prisma.membership.findMany({
      where: { cooperativeId, status: { not: 'removed' } },
      orderBy: { user: { name: 'asc' } },
      select: memberSelect,
    });
    return rows.map(toMember);
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
      invitation: NewInvitation;
      audit: AuditInput;
    },
  ): Promise<{ membershipId: string; userId: string } | 'already_member'> {
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

        const membership = await tx.membership.create({
          data: {
            userId: user.id,
            cooperativeId,
            profileId: data.profileId,
            isPartner: data.isPartner,
            partnerNumber: data.partnerNumber,
            invitation: { create: data.invitation },
          },
          select: { id: true },
        });
        await this.audit(tx, cooperativeId, user.id, data.audit);
        return { membershipId: membership.id, userId: user.id };
      });
    } catch (error) {
      // The partial unique index (BR-ACC-02) settles two simultaneous invitations.
      if (error instanceof AlreadyMember || isUniqueViolation(error)) return 'already_member';
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

      if (update.status || update.profileId) {
        await tx.membership.update({
          where: { id: membershipId },
          data: { status: update.status, profileId: update.profileId },
        });
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
