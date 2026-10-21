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
  isPartner: true,
  status: 'active',
  profileName: 'Socio',
  joinedAt: new Date('2026-01-01'),
  ...overrides,
});

const ANA = member(1); // member (own scope)
const BEN = member(2); // member
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
};

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

describe('US-MEM-01 / US-MEM-02: my record and capital', () => {
  it('US-MEM-02: a member sees their record with the capital and the movements newest first', async () => {
    const { deps } = setup();

    const mine = await getMyRecord(deps, asMember);
    const list = await listMyMovements(deps, asMember);

    expect(mine.member.partnerNumber).toBe('001');
    expect(mine.balanceCents).toBe(50000n);
    expect(list.balanceCents).toBe(50000n);
    expect(list.movements.map((m) => m.date)).toEqual(['2026-02-10', '2026-01-10']);
  });

  it('US-MEM-02: without movements the capital is zero', async () => {
    const { deps } = setup();

    const mine = await getMyRecord(deps, contextOf(BOARD, { level: 'read', scope: 'all' }));
    const list = await listMyMovements(deps, asBoard);

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
    await expect(listMyMovements(deps, none)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(listMembers(deps, none)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(listMemberMovements(deps, none, ANA.membershipId)).rejects.toMatchObject({
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
    await expect(listMemberMovements(deps, asMember, BEN.membershipId)).rejects.toBeInstanceOf(
      MemberNotFoundError,
    );
  });

  it('with "own" scope the member can read their own movements through the member route', async () => {
    const { deps } = setup();
    const result = await listMemberMovements(deps, asMember, ANA.membershipId);
    expect(result.balanceCents).toBe(50000n);
  });

  it('ADR-003: a member of another cooperative is a 404 even with "all" scope', async () => {
    const { deps } = setup();
    await expect(listMemberMovements(deps, asBoard, FOREIGN.membershipId)).rejects.toBeInstanceOf(
      MemberNotFoundError,
    );
  });

  it('ADR-003: the same user in the other cooperative never sees this one', async () => {
    const { deps } = setup();
    const elsewhere = contextOf(BOARD, { level: 'read', scope: 'all' }, OTHER_COOP);
    await expect(listMemberMovements(deps, elsewhere, BEN.membershipId)).rejects.toBeInstanceOf(
      MemberNotFoundError,
    );
  });

  it('ADR-003: ids that are not UUIDs, non-partners and removed partners are a 404', async () => {
    const { deps } = setup();
    for (const target of ['not-a-uuid', MANAGER.membershipId, GONE.membershipId]) {
      await expect(listMemberMovements(deps, asBoard, target)).rejects.toBeInstanceOf(
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
    const result = await listMemberMovements(deps, asBoard, BEN.membershipId);
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
    expect((await listMemberMovements(deps, asBoard, BEN.membershipId)).balanceCents).toBe(35000n);
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
