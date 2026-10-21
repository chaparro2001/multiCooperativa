import { describe, expect, it } from 'vitest';

import { type CooperativeContext, ModuleAccessDeniedError } from '../../access';
import type { UnreadStore } from './ports/unread-store';
import { countUnreadAnnouncements } from './unread';

const context = (level: 'read' | 'manage' | null, cooperativeId = 'coop-a', membershipId = 'm1') =>
  ({
    userId: 'u',
    sessionId: 's',
    cooperativeId,
    membershipId,
    profileName: 'x',
    isPartner: true,
    permissions: level ? [{ module: 'announcements', level, scope: 'all' }] : [],
  }) as CooperativeContext;

interface Row {
  cooperativeId: string;
  status: 'draft' | 'published' | 'withdrawn';
  readBy: string[];
}

/** Same rules as the Prisma store. */
const storeOf = (rows: Row[]): UnreadStore => ({
  countUnread: async (cooperativeId, membershipId) =>
    rows.filter(
      (r) =>
        r.cooperativeId === cooperativeId &&
        r.status === 'published' &&
        !r.readBy.includes(membershipId),
    ).length,
});

describe('countUnreadAnnouncements (US-ANN-08)', () => {
  const rows: Row[] = [
    { cooperativeId: 'coop-a', status: 'published', readBy: [] },
    { cooperativeId: 'coop-a', status: 'published', readBy: ['m1'] },
    { cooperativeId: 'coop-a', status: 'published', readBy: ['m2'] },
    { cooperativeId: 'coop-a', status: 'draft', readBy: [] },
    { cooperativeId: 'coop-a', status: 'withdrawn', readBy: [] },
    { cooperativeId: 'coop-b', status: 'published', readBy: [] },
  ];
  const deps = { unread: storeOf(rows) };

  it('counts the published ones the caller has not read, in its cooperative only', async () => {
    expect(await countUnreadAnnouncements(deps, context('read'))).toEqual({ unread: 2 });
    expect(await countUnreadAnnouncements(deps, context('read', 'coop-a', 'm2'))).toEqual({
      unread: 2,
    });
    expect(await countUnreadAnnouncements(deps, context('read', 'coop-b'))).toEqual({ unread: 1 });
  });

  it('a manager sees the same count: drafts are not unread announcements', async () => {
    expect(await countUnreadAnnouncements(deps, context('manage'))).toEqual({ unread: 2 });
  });

  it('denies without announcements access', async () => {
    await expect(countUnreadAnnouncements(deps, context(null))).rejects.toBeInstanceOf(
      ModuleAccessDeniedError,
    );
  });
});
