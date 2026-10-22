import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type {
  AccessContextStore,
  ActiveMembership,
  UserSummary,
} from '../application/ports/access-context-store';
import { toDomainPermission } from './permission-mapper';

export class PrismaAccessContextStore implements AccessContextStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveMembership(
    userId: string,
    cooperativeId: string,
  ): Promise<ActiveMembership | null> {
    // One indexed query per request (NFR-ACC-07): membership, profile and permissions together.
    const membership = await this.prisma.membership.findFirst({
      where: { userId, cooperativeId, status: 'active' },
      select: {
        id: true,
        isPartner: true,
        profile: {
          select: {
            name: true,
            permissions: { select: { module: true, level: true, scope: true } },
          },
        },
      },
    });
    if (!membership) return null;

    return {
      membershipId: membership.id,
      profileName: membership.profile.name,
      isPartner: membership.isPartner,
      permissions: membership.profile.permissions.map(toDomainPermission),
    };
  }

  async findUserSummary(userId: string): Promise<UserSummary | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        memberships: {
          where: { status: 'active' },
          orderBy: { cooperative: { name: 'asc' } },
          select: {
            id: true,
            isPartner: true,
            cooperative: { select: { id: true, name: true } },
            profile: { select: { name: true } },
          },
        },
      },
    });
    if (!user) return null;

    // Branding lives in its own table keyed by cooperative (ADR-018); no row means the default theme.
    const branding = await this.prisma.cooperativeBranding.findMany({
      where: { cooperativeId: { in: user.memberships.map((m) => m.cooperative.id) } },
      select: { cooperativeId: true, primaryColor: true },
    });
    const colorByCooperative = new Map(branding.map((b) => [b.cooperativeId, b.primaryColor]));

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      memberships: user.memberships.map((membership) => ({
        membershipId: membership.id,
        cooperativeId: membership.cooperative.id,
        cooperativeName: membership.cooperative.name,
        primaryColor: colorByCooperative.get(membership.cooperative.id) ?? null,
        profileName: membership.profile.name,
        isPartner: membership.isPartner,
      })),
    };
  }
}
