import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { InvitationStore, PendingInvitation } from '../application/ports/invitation-store';

/** Thrown inside the transaction to roll it back when another request got there first. */
class LostRace extends Error {}

/** Looked up by token before the user has any session or cooperative context. */
export class PrismaInvitationStore implements InvitationStore {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTokenHash(tokenHash: string): Promise<PendingInvitation | null> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash },
      include: {
        membership: {
          select: {
            status: true,
            cooperativeId: true,
            user: { select: { id: true, passwordHash: true } },
          },
        },
      },
    });
    if (!invitation) return null;

    const { membership } = invitation;
    return {
      id: invitation.id,
      membershipId: invitation.membershipId,
      membershipStatus: membership.status,
      cooperativeId: membership.cooperativeId,
      expiresAt: invitation.expiresAt,
      usedAt: invitation.usedAt,
      user: { id: membership.user.id, hasPassword: membership.user.passwordHash !== null },
    };
  }

  async accept(data: {
    invitationId: string;
    membershipId: string;
    userId: string;
    usedAt: Date;
    passwordHash: string | null;
  }): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const used = await tx.invitation.updateMany({
          where: { id: data.invitationId, usedAt: null },
          data: { usedAt: data.usedAt },
        });
        const activated = await tx.membership.updateMany({
          where: { id: data.membershipId, status: 'invited' },
          data: { status: 'active' },
        });
        if (used.count !== 1 || activated.count !== 1) throw new LostRace();

        if (data.passwordHash !== null) {
          // Only if still unset: a parallel invitation of the same user may have set it.
          const updated = await tx.user.updateMany({
            where: { id: data.userId, passwordHash: null },
            data: { passwordHash: data.passwordHash },
          });
          if (updated.count !== 1) throw new LostRace();
        }
      });
      return true;
    } catch (error) {
      if (error instanceof LostRace) return false;
      throw error;
    }
  }
}
