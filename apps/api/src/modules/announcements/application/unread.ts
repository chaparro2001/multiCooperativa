import { type CooperativeContext, requireAccess } from '../../access';
import type { UnreadStore } from './ports/unread-store';

export interface UnreadDeps {
  unread: UnreadStore;
}

/**
 * US-ANN-08: how many announcements the caller has not opened, for the badge of the home.
 * Only published ones count (a draft or a withdrawn one is not in a member's list) and only
 * those of the caller's cooperative; the read mark is the caller's own (US-ANN-03).
 */
export async function countUnreadAnnouncements(
  deps: UnreadDeps,
  context: CooperativeContext,
): Promise<{ unread: number }> {
  requireAccess(context.permissions, 'announcements', 'read');
  return { unread: await deps.unread.countUnread(context.cooperativeId, context.membershipId) };
}
