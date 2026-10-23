import { describe, expect, it } from 'vitest';

import type { CooperativeContext } from '../../access';
import { InsufficientCapitalError, InvalidMovementError } from '../domain/errors';
import { createMemberAreaReads } from './assistant-reads';
import { MemberNotFoundError } from './errors';
import {
  getMyRecord,
  listMemberMovements,
  listMembers,
  listMyMovements,
  registerMovement,
} from './member-area';
import type { MemberDirectory, MemberRecord } from './ports/member-directory';
import { InMemoryCapitalStore } from './testing/in-memory-capital-store';

const COOP = '11111111-1111-4111-8111-111111111111';
const OTHER_COOP = '22222222-2222-4222-8222-222222222222';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const member = (n: number, overrides: Partial<MemberRecord> = {}): MemberRecord => ({
  membershipId: id(n),
  name: `Member ${n}`,
  email: `m${n}@test.test`,
  partnerNumber: String(n).padStart(3, '0'),
  nif: null,
  isPartner: true,
  status: 'active',
  profileName: 'Socio',
  joinedAt: new Date('2026-01-01'),
  ...overrides,
});

const ANA = member(1, { name: 'Ana García' }); // member (own scope)
const BEN = member(2, { nif: '12345678Z' }); // member, also a supplier
const BOARD = member(3, { profileName: 'Consejo rector' });
const MANAGER = member(4, { isPartner: false, partnerNumber: null, profileName: 'Gestor' });
const GONE = member(5, { status: 'removed' });
const FOREIGN = member(6); // belongs to OTHER_COOP

const ALL = [ANA, BEN, BOARD, MANAGER, GONE];

const poolOf = (cooperativeId: string) =>
  cooperativeId === COOP ? ALL : cooperativeId === OTHER_COOP ? [FOREIGN] : [];

const directory: MemberDirectory = {
  async findMember(cooperativeId, membershipId) {
    return poolOf(cooperativeId).find((m) => m.membershipId === membershipId) ?? null;
  },
  async listPartners(cooperativeId) {
    return poolOf(cooperativeId).filter((m) => m.isPartner && m.status !== 'removed');
  },
  async partnerCensus(cooperativeId, period) {
    censusCalls.push({ cooperativeId, ...period });
    return {
      activePartners: 2,
      invitedNotActivated: 1,
      suspendedPartners: 0,
      joinedInPeriod: 1,
      leftInPeriod: 1,
    };
  },
};
const censusCalls: { cooperativeId: string; from?: string; to?: string }[] = [];

const contextOf = (
  who: MemberRecord,
  grant: { level: 'read' | 'manage'; scope: 'own' | 'all' } | null,
  cooperativeId = COOP,
): CooperativeContext => ({
  userId: `user-${who.membershipId}`,
  sessionId: 's',
  cooperativeId,
  membershipId: who.membershipId,
  profileName: who.profileName,
  isPartner: who.isPartner,
  permissions: grant ? [{ module: 'member-area', ...grant }] : [],
});

const asMember = contextOf(ANA, { level: 'read', scope: 'own' });
const asBoard = contextOf(BOARD, { level: 'read', scope: 'all' });
const asManager = contextOf(MANAGER, { level: 'manage', scope: 'all' });

function setup() {
  const capital = new InMemoryCapitalStore();
  const move = (
    who: MemberRecord,
    type: 'mandatory_contribution' | 'refund',
    amount: bigint,
    date = '2026-03-01',
    cooperativeId = COOP,
  ) =>
    capital.add(cooperativeId, who.membershipId, {
      date,
      type,
      concept: 'seed',
      amountCents: amount,
    });
  move(ANA, 'mandatory_contribution', 60000n, '2026-01-10');
  move(ANA, 'refund', 10000n, '2026-02-10');
  move(BEN, 'mandatory_contribution', 30000n);
  move(FOREIGN, 'mandatory_contribution', 99900n, '2026-03-01', OTHER_COOP);
  return { deps: { capital, members: directory }, capital };
}

const NEW = {
  date: '2026-10-05',
  type: 'voluntary_contribution' as const,
  concept: 'Extra',
  amount: '50.00',
};

const PAGE = { limit: 50 };

describe('US-MEM-02: movements are paginated, the capital is not', () => {
  it('BR-MEM-04: the capital is the sum of every movement, whatever the page', async () => {
    const { deps } = setup();

    const first = await listMyMovements(deps, asMember, { limit: 1 });
    const second = await listMyMovements(deps, asMember, { limit: 1, before: first.nextCursor! });

    expect(first.movements.map((m) => m.date)).toEqual(['2026-02-10']);
    expect(second.movements.map((m) => m.date)).toEqual(['2026-01-10']);
    expect(second.nextCursor).toBeNull();
    expect(first.balanceCents).toBe(50000n);
    expect(second.balanceCents).toBe(50000n);
  });
});

describe('US-MEM-01 / US-MEM-02: my record and capital', () => {
  it('US-MEM-02: a member sees their record with the capital and the movements newest first', async () => {
    const { deps } = setup();

    const mine = await getMyRecord(deps, asMember);
    const list = await listMyMovements(deps, asMember, PAGE);

    expect(mine.member.partnerNumber).toBe('001');
    expect(mine.balanceCents).toBe(50000n);
    expect(list.balanceCents).toBe(50000n);
    expect(list.movements.map((m) => m.date)).toEqual(['2026-02-10', '2026-01-10']);
  });

  it('US-MEM-02: without movements the capital is zero', async () => {
    const { deps } = setup();

    const mine = await getMyRecord(deps, contextOf(BOARD, { level: 'read', scope: 'all' }));
    const list = await listMyMovements(deps, asBoard, PAGE);

    expect(mine.balanceCents).toBe(0n);
    expect(list.movements).toEqual([]);
  });

  it('US-MEM-01: any profile with the module has a record, even a manager who is not a partner', async () => {
    const { deps } = setup();
    const mine = await getMyRecord(deps, asManager);
    expect(mine.member.isPartner).toBe(false);
    expect(mine.balanceCents).toBe(0n);
  });

  it('US-ACC-07: without the module permission everything is denied (403)', async () => {
    const { deps } = setup();
    const none = contextOf(ANA, null);
    await expect(getMyRecord(deps, none)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(listMyMovements(deps, none, PAGE)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(listMembers(deps, none)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(listMemberMovements(deps, none, ANA.membershipId, PAGE)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(registerMovement(deps, none, BEN.membershipId, NEW)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('double isolation: by cooperative and by member', () => {
  it('US-MEM-01: with "own" scope another member of my cooperative is a 404, not a 403', async () => {
    const { deps } = setup();
    await expect(
      listMemberMovements(deps, asMember, BEN.membershipId, PAGE),
    ).rejects.toBeInstanceOf(MemberNotFoundError);
  });

  it('with "own" scope the member can read their own movements through the member route', async () => {
    const { deps } = setup();
    const result = await listMemberMovements(deps, asMember, ANA.membershipId, PAGE);
    expect(result.balanceCents).toBe(50000n);
  });

  it('ADR-003: a member of another cooperative is a 404 even with "all" scope', async () => {
    const { deps } = setup();
    await expect(
      listMemberMovements(deps, asBoard, FOREIGN.membershipId, PAGE),
    ).rejects.toBeInstanceOf(MemberNotFoundError);
  });

  it('ADR-003: the same user in the other cooperative never sees this one', async () => {
    const { deps } = setup();
    const elsewhere = contextOf(BOARD, { level: 'read', scope: 'all' }, OTHER_COOP);
    await expect(
      listMemberMovements(deps, elsewhere, BEN.membershipId, PAGE),
    ).rejects.toBeInstanceOf(MemberNotFoundError);
  });

  it('ADR-003: ids that are not UUIDs, non-partners and removed partners are a 404', async () => {
    const { deps } = setup();
    for (const target of ['not-a-uuid', MANAGER.membershipId, GONE.membershipId]) {
      await expect(listMemberMovements(deps, asBoard, target, PAGE)).rejects.toBeInstanceOf(
        MemberNotFoundError,
      );
    }
  });
});

describe('US-MEM-04: the capital of all members', () => {
  it('US-MEM-04: "all" scope lists every partner with capital and the cooperative total', async () => {
    const { deps } = setup();

    const result = await listMembers(deps, asBoard);

    expect(result.items.map((item) => [item.member.partnerNumber, item.balanceCents])).toEqual([
      ['001', 50000n],
      ['002', 30000n],
      ['003', 0n],
    ]);
    expect(result.totalCents).toBe(80000n);
  });

  it('US-MEM-04: the other cooperative total does not leak in', async () => {
    const { deps } = setup();
    const elsewhere = contextOf(FOREIGN, { level: 'read', scope: 'all' }, OTHER_COOP);
    expect((await listMembers(deps, elsewhere)).totalCents).toBe(99900n);
  });

  it('US-MEM-04: a profile with "own" scope cannot list everyone (403)', async () => {
    const { deps } = setup();
    await expect(listMembers(deps, asMember)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('US-MEM-04: the board reads any member movements', async () => {
    const { deps } = setup();
    const result = await listMemberMovements(deps, asBoard, BEN.membershipId, PAGE);
    expect(result.balanceCents).toBe(30000n);
    expect(result.member.name).toBe('Member 2');
  });
});

describe('US-MEM-03: registering movements', () => {
  it('US-MEM-03: management registers a movement and the capital is recalculated', async () => {
    const { deps } = setup();

    const result = await registerMovement(deps, asManager, BEN.membershipId, NEW);

    expect(result.balanceCents).toBe(35000n);
    expect(result.movement.recordedByMembershipId).toBe(MANAGER.membershipId);
    expect((await listMemberMovements(deps, asBoard, BEN.membershipId, PAGE)).balanceCents).toBe(
      35000n,
    );
  });

  it('US-MEM-03: the governing board reads but does not register (403)', async () => {
    const { deps, capital } = setup();
    const before = capital.rows.length;
    await expect(registerMovement(deps, asBoard, BEN.membershipId, NEW)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(capital.rows).toHaveLength(before);
  });

  it('US-MEM-03: a member cannot register movements, not even their own (403)', async () => {
    const { deps } = setup();
    await expect(registerMovement(deps, asMember, ANA.membershipId, NEW)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('US-MEM-03: a refund greater than the available capital is rejected and nothing is stored', async () => {
    const { deps, capital } = setup();
    const before = capital.rows.length;
    await expect(
      registerMovement(deps, asManager, BEN.membershipId, {
        ...NEW,
        type: 'refund',
        amount: '300.01',
      }),
    ).rejects.toBeInstanceOf(InsufficientCapitalError);
    expect(capital.rows).toHaveLength(before);
  });

  it('BR-MEM-04: an invalid amount is rejected', async () => {
    const { deps } = setup();
    await expect(
      registerMovement(deps, asManager, BEN.membershipId, { ...NEW, amount: '10.005' }),
    ).rejects.toBeInstanceOf(InvalidMovementError);
  });

  it('ADR-003: management cannot register in a member of another cooperative or a non-partner (404)', async () => {
    const { deps, capital } = setup();
    const before = capital.rows.length;
    for (const target of [FOREIGN.membershipId, MANAGER.membershipId, GONE.membershipId]) {
      await expect(registerMovement(deps, asManager, target, NEW)).rejects.toBeInstanceOf(
        MemberNotFoundError,
      );
    }
    expect(capital.rows).toHaveLength(before);
  });
});

describe('assistant reads (BR-AI-02)', () => {
  it("my_contributions: the caller's own capital and latest movements, with signed changes", async () => {
    const { deps } = setup();
    const reads = createMemberAreaReads(deps);

    const mine = await reads.myContributions(asMember, 1);

    expect(mine.capital).toBe('500.00');
    expect(mine.latestMovements).toEqual([
      { date: '2026-02-10', type: 'refund', concept: 'seed', capitalChange: '-100.00' },
    ]);
  });

  it("my_contributions: a board member gets their own data, never another member's", async () => {
    const { deps } = setup();
    const mine = await createMemberAreaReads(deps).myContributions(asBoard, 5);
    expect(mine.capital).toBe('0.00');
    expect(mine.latestMovements).toEqual([]);
  });

  it('BR-AI-01: without the module permission it is denied', async () => {
    const { deps } = setup();
    await expect(
      createMemberAreaReads(deps).myContributions(contextOf(ANA, null), 5),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('US-MEM-05 · assistant reads about the whole cooperative (ADR-025)', () => {
  const reads = (deps: ReturnType<typeof setup>['deps']) => createMemberAreaReads(deps);

  it('capital_summary: the total is what the partners hold now and the period counts what was registered in it', async () => {
    const { deps, capital } = setup();
    capital.add(COOP, ANA.membershipId, {
      date: '2025-12-31',
      type: 'correction',
      concept: 'Old',
      amountCents: -500n,
    });

    const all = await reads(deps).capitalSummary(asBoard, {});
    const year = await reads(deps).capitalSummary(asBoard, {
      from: '2026-01-01',
      to: '2026-12-31',
    });

    // Ana 500.00 - 5.00 = 495.00 (only one correction, before the period), Ben 300.00.
    expect(all.totalCapital).toBe('795.00');
    expect(all.partners).toBe(3);
    expect(year.period).toMatchObject({
      contributions: '900.00',
      refunds: '100.00',
      corrections: '0.00',
      from: '2026-01-01',
    });
    expect(all.period.corrections).toBe('-5.00');
  });

  it('BR-MEM-06: a member with "own" scope is denied every whole-cooperative read, and so is a profile without the module', async () => {
    const { deps } = setup();
    const nobody = contextOf(ANA, null);

    for (const context of [asMember, nobody]) {
      await expect(reads(deps).capitalSummary(context, {})).rejects.toThrow();
      await expect(reads(deps).census(context, {})).rejects.toThrow();
      await expect(reads(deps).memberDetail(context, 'Ben', 5)).rejects.toThrow();
      await expect(reads(deps).partnersWithNif(context)).rejects.toThrow();
    }
  });

  it('census: joins and leaves only when a period is asked, and always for the caller cooperative', async () => {
    const { deps } = setup();
    censusCalls.length = 0;

    const open = await reads(deps).census(asManager, {});
    const bounded = await reads(deps).census(asManager, { from: '2026-01-01' });

    expect(open).toMatchObject({ activePartners: 2, invitedNotActivated: 1, joinedInPeriod: null });
    expect(bounded).toMatchObject({ joinedInPeriod: 1, leftInPeriod: 1 });
    expect(censusCalls.map((call) => call.cooperativeId)).toEqual([COOP, COOP]);
  });

  it('member_detail: one match gives the record with the NIF, the capital and the latest movements', async () => {
    const { deps } = setup();

    const [ben, ...rest] = await reads(deps).memberDetail(asBoard, 'member 2', 5);

    expect(rest).toEqual([]);
    expect(ben).toMatchObject({
      name: 'Member 2',
      partnerNumber: '002',
      nif: '12345678Z',
      capital: '300.00',
    });
    expect(ben!.latestMovements).toHaveLength(1);
  });

  it('member_detail: several matches give their summary only, and a partner number matches ignoring zeros', async () => {
    const { deps } = setup();

    const several = await reads(deps).memberDetail(asBoard, 'member', 5);
    const byNumber = await reads(deps).memberDetail(asBoard, '2', 5);

    expect(several.length).toBeGreaterThan(1);
    expect(several.every((match) => match.latestMovements === undefined)).toBe(true);
    expect(byNumber.map((match) => match.partnerNumber)).toEqual(['002']);
  });

  it('BR-MEM-07: another cooperative and a partner who left are never found', async () => {
    const { deps } = setup();

    expect(await reads(deps).memberDetail(asBoard, 'Member 6', 5)).toEqual([]);
    expect(await reads(deps).memberDetail(asBoard, 'Member 5', 5)).toEqual([]);
  });

  it('partnersWithNif: only partners that have one', async () => {
    const { deps } = setup();

    expect(await reads(deps).partnersWithNif(asBoard)).toEqual([
      { name: 'Member 2', partnerNumber: '002', nif: '12345678Z' },
    ]);
  });
});
