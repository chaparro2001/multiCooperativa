import { beforeEach, describe, expect, it } from 'vitest';

import type { CooperativeContext } from '../../access';
import { InProcessEventBus } from '../../../shared/events';
import { InMemoryFileStorage } from '../../../shared/files/in-memory-file-storage';
import { convene, createDraft } from '../domain/assembly';
import {
  InsufficientNoticeError,
  InvalidAssemblyTransitionError,
  VotingAlreadyOpenedError,
} from '../domain/errors';
import { type AssemblyDeps, rescheduleAssembly } from './assemblies';
import { AssemblyNotFoundError } from './errors';
import type { AssemblyEvent } from './events';
import type { AssemblyRecord, AssemblyStore } from './ports/assembly-store';

const COOP = '40000000-0000-4000-8000-000000000001';
const OTHER_COOP = '40000000-0000-4000-8000-000000000002';
const ASSEMBLY = '50000000-0000-4000-8000-000000000001';
const now = new Date('2026-10-01T10:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

function context(level: 'read' | 'manage' | null, cooperativeId = COOP): CooperativeContext {
  return {
    userId: 'user-1',
    sessionId: 'session',
    cooperativeId,
    membershipId: 'mem-manager',
    profileName: 'x',
    isPartner: true,
    permissions: level ? [{ module: 'assemblies', level, scope: 'all' }] : [],
  };
}

/** Only what rescheduling uses: a locked read-modify-write scoped by cooperative. */
class FakeStore {
  record!: AssemblyRecord;
  openedVotings = 0;

  async update(cooperativeId: string, id: string, decide: Parameters<AssemblyStore['update']>[2]) {
    if (cooperativeId !== this.record.cooperativeId || id !== this.record.id) return null;
    const next = decide(this.record, 0, this.openedVotings);
    this.record = {
      ...this.record,
      ...next,
      points: this.record.points,
      rescheduledFrom: next.rescheduledFrom ?? null,
    };
    return { assembly: this.record, removedFileKeys: [] };
  }
}

let store: FakeStore;
let published: AssemblyEvent[];
let deps: AssemblyDeps;

const request = (overrides = {}) => ({
  firstCallAt: inDays(30),
  secondCallAt: inDays(30.1),
  place: 'New hall',
  reason: 'Venue unavailable',
  notifyMembers: true,
  ...overrides,
});

beforeEach(() => {
  const draft = createDraft({
    type: 'ordinary',
    firstCallAt: inDays(20),
    secondCallAt: null,
    place: 'Social hall',
    points: [{ title: 'Accounts', description: '', votable: true, majority: 'simple' }],
  });
  store = new FakeStore();
  store.record = {
    ...convene(draft, now, 15),
    id: ASSEMBLY,
    cooperativeId: COOP,
    createdAt: now,
    rescheduledFrom: null,
    points: draft.points.map((p) => ({ ...p, id: 'p1', attachments: [] })),
  };
  published = [];
  const events = new InProcessEventBus<AssemblyEvent>({ onHandlerError: () => {} });
  events.subscribe('AssemblyRescheduled', (event) => void published.push(event));
  deps = {
    assemblies: store as unknown as AssemblyStore,
    votings: {} as AssemblyDeps['votings'],
    settings: { get: async () => ({ minNoticeDays: 15 }) as never },
    members: {} as AssemblyDeps['members'],
    files: new InMemoryFileStorage(),
    events,
    now: () => now,
  };
});

describe('rescheduleAssembly (US-ASM-09)', () => {
  it('Given manage level, when I move a convened assembly, then it is saved and the event is emitted', async () => {
    const moved = await rescheduleAssembly(deps, context('manage'), ASSEMBLY, request());

    expect(moved.firstCallAt).toEqual(inDays(30));
    expect(moved.rescheduledFrom).toMatchObject({ firstCallAt: inDays(20), place: 'Social hall' });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      type: 'AssemblyRescheduled',
      payload: {
        cooperativeId: COOP,
        assemblyId: ASSEMBLY,
        assemblyType: 'ordinary',
        previous: {
          firstCallAt: inDays(20).toISOString(),
          secondCallAt: null,
          place: 'Social hall',
        },
        firstCallAt: inDays(30).toISOString(),
        secondCallAt: inDays(30.1).toISOString(),
        place: 'New hall',
        reason: 'Venue unavailable',
        notifyMembers: true,
        rescheduledByMembershipId: 'mem-manager',
      },
    });
  });

  it('carries the notify flag in the event', async () => {
    await rescheduleAssembly(deps, context('manage'), ASSEMBLY, request({ notifyMembers: false }));
    expect(published[0]!.payload).toMatchObject({ notifyMembers: false });
  });

  it('read level or no permission is denied and changes nothing', async () => {
    for (const level of ['read', null] as const) {
      await expect(rescheduleAssembly(deps, context(level), ASSEMBLY, request())).rejects.toThrow();
    }
    expect(store.record.firstCallAt).toEqual(inDays(20));
    expect(published).toEqual([]);
  });

  it('an assembly of another cooperative does not exist: 404, nothing emitted', async () => {
    await expect(
      rescheduleAssembly(deps, context('manage', OTHER_COOP), ASSEMBLY, request()),
    ).rejects.toThrow(AssemblyNotFoundError);
    await expect(
      rescheduleAssembly(deps, context('manage'), 'not-a-uuid', request()),
    ).rejects.toThrow(AssemblyNotFoundError);
    expect(published).toEqual([]);
  });

  it('refuses a voting already opened and emits nothing', async () => {
    store.openedVotings = 1;
    await expect(rescheduleAssembly(deps, context('manage'), ASSEMBLY, request())).rejects.toThrow(
      VotingAlreadyOpenedError,
    );
    expect(published).toEqual([]);
  });

  it('refuses a cancelled assembly', async () => {
    store.record = { ...store.record, status: 'cancelled' };
    await expect(rescheduleAssembly(deps, context('manage'), ASSEMBLY, request())).rejects.toThrow(
      InvalidAssemblyTransitionError,
    );
  });

  it('the notice counts from now, with the cooperative minimum', async () => {
    await expect(
      rescheduleAssembly(deps, context('manage'), ASSEMBLY, request({ firstCallAt: inDays(10) })),
    ).rejects.toThrow(InsufficientNoticeError);
    expect(published).toEqual([]);
  });
});
