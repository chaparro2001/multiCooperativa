import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import { loadEnv } from '../../../config/env';
import { InProcessEventBus } from '../../../shared/events';
import { InMemoryFileStorage } from '../../../shared/files/in-memory-file-storage';
import { type CooperativeContext, createAccessModule, PREDEFINED_PROFILES } from '../../access';
import * as assemblies from '../application/assemblies';
import type { AssemblyEvent } from '../application/events';
import {
  AlreadyVotedError,
  InsufficientNoticeError,
  NotInCensusError,
  VotingClosedError,
} from '../domain/errors';
import { PrismaAssemblyStore } from './prisma-assembly-store';
import { PrismaSettingsStore } from './prisma-settings-store';
import { PrismaVotingStore } from './prisma-voting-store';

const prisma = createTestPrisma();
const env = loadEnv(process.env);
const access = createAccessModule({
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender: { send: async () => {} },
});
const files = new InMemoryFileStorage();
const events: AssemblyEvent[] = [];
const bus = new InProcessEventBus<AssemblyEvent>({ onHandlerError: () => {} });
for (const type of ['AssemblyConvened', 'VotingOpened', 'VotingClosed'] as const) {
  bus.subscribe(type, (event) => void events.push(event));
}
let now = new Date('2026-10-01T10:00:00Z');
const deps: assemblies.AssemblyDeps = {
  assemblies: new PrismaAssemblyStore(prisma),
  votings: new PrismaVotingStore(prisma),
  settings: new PrismaSettingsStore(prisma),
  members: access.directory,
  files,
  events: bus,
  now: () => now,
};

const DAY = 24 * 60 * 60 * 1000;
let cooperativeId: string;
let manager: CooperativeContext;

/** Adds a member and returns their context, as the access middleware would build it. */
async function member(profileName: string, isPartner: boolean): Promise<CooperativeContext> {
  const profile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId, name: profileName },
  });
  const user = await prisma.user.create({
    data: { email: `${crypto.randomUUID()}@x.test`, name: 'M' },
  });
  const membership = await prisma.membership.create({
    data: { userId: user.id, cooperativeId, profileId: profile.id, status: 'active', isPartner },
  });
  return {
    userId: user.id,
    sessionId: 's',
    cooperativeId,
    membershipId: membership.id,
    profileName,
    isPartner,
    permissions: PREDEFINED_PROFILES.find((p) => p.name === profileName)!.permissions,
  };
}

async function convenedAssembly(
  points = [
    { title: 'Aprobar cuentas', description: '', votable: true, majority: 'simple' as const },
  ],
) {
  const draft = await assemblies.createAssembly(deps, manager, {
    type: 'ordinary',
    firstCallAt: new Date(now.getTime() + 20 * DAY),
    secondCallAt: null,
    place: 'Social hall',
    points,
  });
  return assemblies.conveneAssembly(deps, manager, draft.id);
}

beforeEach(async () => {
  await resetDatabase(prisma);
  events.length = 0;
  now = new Date('2026-10-01T10:00:00Z');
  ({ cooperativeId } = await access.provisionCooperative({
    name: 'Campo',
    cif: 'F12345674',
    admin: { email: 'admin@field.test', name: 'Ana', password: 'a-long-password' },
  }));
  manager = await member('Consejo rector', true);
});
afterAll(() => prisma.$disconnect());

describe('call and items (US-ASM-01, US-ASM-02)', () => {
  it('convening emits AssemblyConvened; with too little notice it is rejected', async () => {
    const assembly = await convenedAssembly();
    expect(assembly.status).toBe('convened');
    expect(events.map((e) => e.type)).toEqual(['AssemblyConvened']);

    const early = await assemblies.createAssembly(deps, manager, {
      type: 'extraordinary',
      firstCallAt: new Date(now.getTime() + 5 * DAY),
      secondCallAt: null,
      place: 'Hall',
      points: [{ title: 'X', description: '', votable: false, majority: null }],
    });
    await expect(assemblies.conveneAssembly(deps, manager, early.id)).rejects.toThrow(
      InsufficientNoticeError,
    );
  });

  it('the minimum notice is configurable per cooperative (BR-ASM-09)', async () => {
    await prisma.assemblySettings.create({ data: { cooperativeId, minNoticeDays: 3 } });
    const draft = await assemblies.createAssembly(deps, manager, {
      type: 'extraordinary',
      firstCallAt: new Date(now.getTime() + 5 * DAY),
      secondCallAt: null,
      place: 'Hall',
      points: [{ title: 'X', description: '', votable: false, majority: null }],
    });

    await expect(assemblies.conveneAssembly(deps, manager, draft.id)).resolves.toMatchObject({
      status: 'convened',
    });
  });

  it('editing the draft keeps the named items and deletes the documentation of the removed ones', async () => {
    const draft = await assemblies.createAssembly(deps, manager, {
      type: 'ordinary',
      firstCallAt: new Date(now.getTime() + 20 * DAY),
      secondCallAt: null,
      place: 'Hall',
      points: [
        { title: 'Cuentas', description: '', votable: true, majority: 'simple' },
        { title: 'Informe', description: '', votable: false, majority: null },
      ],
    });
    const [cuentas, informe] = draft.points;
    await assemblies.addPointAttachment(deps, manager, informe!.id, {
      name: 'informe.pdf',
      content: new TextEncoder().encode('%PDF-1.4 informe'),
    });
    expect(files.files.size).toBe(1);

    const edited = await assemblies.updateAssembly(deps, manager, draft.id, {
      type: 'ordinary',
      firstCallAt: draft.firstCallAt,
      secondCallAt: null,
      place: 'Hall',
      points: [
        { title: 'Nuevo primero', description: '', votable: false, majority: null },
        {
          id: cuentas!.id,
          title: 'Cuentas 2026',
          description: '',
          votable: true,
          majority: 'reinforced',
        },
      ],
    });

    expect(edited.points.map((p) => [p.position, p.title, p.id === cuentas!.id])).toEqual([
      [1, 'Nuevo primero', false],
      [2, 'Cuentas 2026', true],
    ]);
    expect(files.files.size).toBe(0);
  });
});

describe('voting (US-ASM-04, US-ASM-05, US-ASM-06)', () => {
  it('full flow: opening freezes the census, voting, closing computes the result', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    const members = await Promise.all([1, 2, 3].map(() => member('Socio', true)));

    const opened = await assemblies.openVoting(deps, manager, pointId);
    // Census: the board member and the 3 members (the sign-up administrator is not a partner).
    expect(opened).toMatchObject({ status: 'open', censusSize: 4, votesCast: 0 });

    await assemblies.castVote(deps, members[0]!, pointId, 'in_favor');
    await assemblies.castVote(deps, members[1]!, pointId, 'in_favor');
    const mine = await assemblies.castVote(deps, members[2]!, pointId, 'against');
    expect(mine).toMatchObject({ myVote: 'against', canVote: false, votesCast: 3, tally: null });

    // BR-ASM-11: while open, with read access only participation is visible.
    expect(await assemblies.getVoting(deps, members[0]!, pointId)).toMatchObject({
      tally: null,
      votesCast: 3,
    });
    expect((await assemblies.getVoting(deps, manager, pointId)).tally).toEqual({
      inFavor: 2,
      against: 1,
      abstentions: 0,
    });

    const closed = await assemblies.closeVoting(deps, manager, pointId);
    expect(closed.result).toEqual({
      census: 4,
      inFavor: 2,
      against: 1,
      abstentions: 0,
      votesCast: 3,
      quorumReached: true,
      call: 'first',
      outcome: 'approved',
    });
    expect(events.map((e) => e.type)).toEqual(['AssemblyConvened', 'VotingOpened', 'VotingClosed']);

    // Closed: everyone sees the result; votes are no longer accepted.
    expect((await assemblies.getVoting(deps, members[0]!, pointId)).tally).toEqual({
      inFavor: 2,
      against: 1,
      abstentions: 0,
    });
    await expect(assemblies.castVote(deps, manager, pointId, 'in_favor')).rejects.toThrow(
      VotingClosedError,
    );
  });

  it('duplicate vote rejected also under concurrent races (NFR-ASM-01)', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    const voter = await member('Socio', true);
    await assemblies.openVoting(deps, manager, pointId);

    const results = await Promise.allSettled(
      (['in_favor', 'against', 'abstention', 'in_favor', 'against'] as const).map((choice) =>
        assemblies.castVote(deps, voter, pointId, choice),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(rejected.every((r) => r.reason instanceof AlreadyVotedError)).toBe(true);
    expect(await prisma.vote.count()).toBe(1);
  });

  it('Dado que ya he votado, cuando vuelvo a votar, entonces se rechaza indicando mi voto', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    const voter = await member('Socio', true);
    await assemblies.openVoting(deps, manager, pointId);
    await assemblies.castVote(deps, voter, pointId, 'abstention');

    const error = await assemblies
      .castVote(deps, voter, pointId, 'in_favor')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AlreadyVotedError);
    expect((error as AlreadyVotedError).choice).toBe('abstention');
  });

  it('a member added after the voting opened cannot vote (BR-ASM-02)', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    await assemblies.openVoting(deps, manager, pointId);
    const late = await member('Socio', true);

    await expect(assemblies.castVote(deps, late, pointId, 'in_favor')).rejects.toThrow(
      NotInCensusError,
    );
  });

  it('a manager who is not a partner cannot vote (BR-ACC-06)', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    const nonPartner = await member('Gestor', false);
    await assemblies.openVoting(deps, manager, pointId);

    await expect(assemblies.castVote(deps, nonPartner, pointId, 'in_favor')).rejects.toThrow(
      NotInCensusError,
    );
  });

  it('the database rejects a vote from someone outside the census even if the code failed', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    await assemblies.openVoting(deps, manager, pointId);
    const voting = await prisma.voting.findUniqueOrThrow({ where: { pointId } });
    const outsider = await member('Socio', true);

    await expect(
      prisma.vote.create({
        data: { votingId: voting.id, membershipId: outsider.membershipId, choice: 'in_favor' },
      }),
    ).rejects.toThrow();
  });

  it('without quorum in the first call and with a second call, the second applies (US-ASM-07)', async () => {
    const draft = await assemblies.createAssembly(deps, manager, {
      type: 'ordinary',
      firstCallAt: new Date(now.getTime() + 20 * DAY),
      secondCallAt: new Date(now.getTime() + 20 * DAY + 30 * 60 * 1000),
      place: 'Hall',
      points: [{ title: 'Cuentas', description: '', votable: true, majority: 'simple' }],
    });
    const assembly = await assemblies.conveneAssembly(deps, manager, draft.id);
    const pointId = assembly.points[0]!.id;
    await Promise.all([1, 2, 3].map(() => member('Socio', true)));
    await assemblies.openVoting(deps, manager, pointId);
    await assemblies.castVote(deps, manager, pointId, 'in_favor');

    const closed = await assemblies.closeVoting(deps, manager, pointId);

    // 1 of 4 votes = 25 % < 50 %: the second call has no minimum.
    expect(closed.result).toMatchObject({
      call: 'second',
      quorumReached: true,
      outcome: 'approved',
    });
  });

  it('the assembly is not closed with open votings; afterwards it is', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    await assemblies.openVoting(deps, manager, pointId);

    await expect(assemblies.closeAssembly(deps, manager, assembly.id)).rejects.toThrow(
      /open votings/,
    );
    await assemblies.closeVoting(deps, manager, pointId);
    await expect(assemblies.closeAssembly(deps, manager, assembly.id)).resolves.toMatchObject({
      status: 'held',
    });
  });

  it('opening twice at once opens only one voting', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;

    const results = await Promise.allSettled(
      [1, 2].map(() => assemblies.openVoting(deps, manager, pointId)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.voting.count()).toBe(1);
  });
});
