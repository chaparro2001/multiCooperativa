import { describe, expect, it } from 'vitest';

import { attentionItems } from './attention';

const now = new Date('2026-10-22T10:00:00Z');
const asm = (id: string, firstCallAt: string, openVotings = 0, status = 'convened' as const) => ({
  id,
  status,
  firstCallAt,
  openVotings,
});

describe('attentionItems', () => {
  it('is empty when nothing is pending', () => {
    expect(attentionItems({ now })).toEqual([]);
    expect(attentionItems({ now, unreadAnnouncements: 0, invoicesNeedingAttention: 0 })).toEqual(
      [],
    );
  });

  it('orders by urgency and caps at three', () => {
    const items = attentionItems({
      now,
      assemblies: [asm('a1', '2026-11-01T10:00:00Z', 2)],
      invoicesNeedingAttention: 4,
      unreadAnnouncements: 3,
    });
    expect(items.map((i) => i.kind)).toEqual(['votes', 'invoices', 'assembly']);
  });

  it('points to the assembly when only one has open votes, else to the list', () => {
    const one = attentionItems({ now, assemblies: [asm('a1', '2026-11-01T10:00:00Z', 1)] });
    expect(one[0]).toMatchObject({ kind: 'votes', count: 1, route: '/assemblies/a1' });
    const two = attentionItems({
      now,
      assemblies: [asm('a1', '2026-11-01T10:00:00Z', 1), asm('a2', '2026-11-02T10:00:00Z', 2)],
    });
    expect(two[0]).toMatchObject({ kind: 'votes', count: 3, route: '/assemblies' });
  });

  it('picks the earliest upcoming convened assembly and ignores past, draft and held ones', () => {
    const items = attentionItems({
      now,
      assemblies: [
        asm('past', '2026-10-01T10:00:00Z'),
        asm('draft', '2026-10-25T10:00:00Z', 0, 'draft' as never),
        asm('late', '2026-12-01T10:00:00Z'),
        asm('soon', '2026-11-03T10:00:00Z'),
      ],
    });
    expect(items).toEqual([
      { kind: 'assembly', route: '/assemblies/soon', at: '2026-11-03T10:00:00Z' },
    ]);
  });

  it('lists unread announcements', () => {
    expect(attentionItems({ now, unreadAnnouncements: 3 })).toEqual([
      { kind: 'announcements', count: 3, route: '/announcements' },
    ]);
  });
});
