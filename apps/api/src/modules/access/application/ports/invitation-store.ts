import type { InvitationState } from '../../domain/invitation';
import type { MembershipStatus } from '../../domain/membership';

export interface PendingInvitation extends InvitationState {
  id: string;
  membershipId: string;
  membershipStatus: MembershipStatus;
  cooperativeId: string;
  user: { id: string; hasPassword: boolean };
}

export interface InvitationStore {
  findByTokenHash(tokenHash: string): Promise<PendingInvitation | null>;
  /**
   * Atomically marks the invitation as used, activates the membership and, for a
   * new user, sets the password. False if the invitation was used concurrently.
   */
  accept(data: {
    invitationId: string;
    membershipId: string;
    userId: string;
    usedAt: Date;
    passwordHash: string | null;
  }): Promise<boolean>;
}
