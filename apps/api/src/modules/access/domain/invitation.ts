import { InvitationNotUsableError } from './errors';

export const INVITATION_TTL_DAYS = 7;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface InvitationState {
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export type InvitationCheck = 'valid' | 'expired' | 'used';

export function issueInvitation(now: Date): InvitationState {
  return { expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_IN_MS), usedAt: null };
}

export function checkInvitation(invitation: InvitationState, now: Date): InvitationCheck {
  if (invitation.usedAt) return 'used';
  if (now.getTime() >= invitation.expiresAt.getTime()) return 'expired';
  return 'valid';
}

/** Single use (RN-ACC-10). */
export function useInvitation<T extends InvitationState>(invitation: T, now: Date): T {
  const check = checkInvitation(invitation, now);
  if (check !== 'valid') {
    throw new InvitationNotUsableError(check);
  }
  return { ...invitation, usedAt: now };
}
