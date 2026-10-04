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
for (const type of ['AsambleaConvocada', 'VotacionAbierta', 'VotacionCerrada'] as const) {
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
    data: { userId: user.id, cooperativeId, profileId: profile.id, status: 'activa', isPartner },
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
    type: 'ordinaria',
    firstCallAt: new Date(now.getTime() + 20 * DAY),
    secondCallAt: null,
    place: 'Salón social',
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
    admin: { email: 'admin@campo.test', name: 'Ana', password: 'una-clave-larga' },
  }));
  manager = await member('Consejo rector', true);
});
afterAll(() => prisma.$disconnect());

describe('convocatoria y puntos (HU-ASA-01, HU-ASA-02)', () => {
  it('convocar emite AsambleaConvocada; con poca antelación se rechaza', async () => {
    const assembly = await convenedAssembly();
    expect(assembly.status).toBe('convocada');
    expect(events.map((e) => e.type)).toEqual(['AsambleaConvocada']);

    const early = await assemblies.createAssembly(deps, manager, {
      type: 'extraordinaria',
      firstCallAt: new Date(now.getTime() + 5 * DAY),
      secondCallAt: null,
      place: 'Salón',
      points: [{ title: 'X', description: '', votable: false, majority: null }],
    });
    await expect(assemblies.conveneAssembly(deps, manager, early.id)).rejects.toThrow(
      InsufficientNoticeError,
    );
  });

  it('la antelación mínima es configurable por cooperativa (RN-ASA-09)', async () => {
    await prisma.assemblySettings.create({ data: { cooperativeId, minNoticeDays: 3 } });
    const draft = await assemblies.createAssembly(deps, manager, {
      type: 'extraordinaria',
      firstCallAt: new Date(now.getTime() + 5 * DAY),
      secondCallAt: null,
      place: 'Salón',
      points: [{ title: 'X', description: '', votable: false, majority: null }],
    });

    await expect(assemblies.conveneAssembly(deps, manager, draft.id)).resolves.toMatchObject({
      status: 'convocada',
    });
  });

  it('editar el borrador conserva los puntos que se nombran y borra la documentación de los quitados', async () => {
    const draft = await assemblies.createAssembly(deps, manager, {
      type: 'ordinaria',
      firstCallAt: new Date(now.getTime() + 20 * DAY),
      secondCallAt: null,
      place: 'Salón',
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
      type: 'ordinaria',
      firstCallAt: draft.firstCallAt,
      secondCallAt: null,
      place: 'Salón',
      points: [
        { title: 'Nuevo primero', description: '', votable: false, majority: null },
        {
          id: cuentas!.id,
          title: 'Cuentas 2026',
          description: '',
          votable: true,
          majority: 'reforzada',
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

describe('votación (HU-ASA-04, HU-ASA-05, HU-ASA-06)', () => {
  it('flujo completo: abrir fija el censo, votar, cerrar calcula el resultado', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    const socios = await Promise.all([1, 2, 3].map(() => member('Socio', true)));

    const opened = await assemblies.openVoting(deps, manager, pointId);
    // Censo: el consejero y los 3 socios (el administrador del alta no es socio).
    expect(opened).toMatchObject({ status: 'abierta', censusSize: 4, votesCast: 0 });

    await assemblies.castVote(deps, socios[0]!, pointId, 'a_favor');
    await assemblies.castVote(deps, socios[1]!, pointId, 'a_favor');
    const mine = await assemblies.castVote(deps, socios[2]!, pointId, 'en_contra');
    expect(mine).toMatchObject({ myVote: 'en_contra', canVote: false, votesCast: 3, tally: null });

    // RN-ASA-11: mientras está abierta, con consulta solo se ve la participación.
    expect(await assemblies.getVoting(deps, socios[0]!, pointId)).toMatchObject({
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
      call: 'primera',
      outcome: 'aprobado',
    });
    expect(events.map((e) => e.type)).toEqual([
      'AsambleaConvocada',
      'VotacionAbierta',
      'VotacionCerrada',
    ]);

    // Cerrada: todos ven el resultado; ya no se admiten votos.
    expect((await assemblies.getVoting(deps, socios[0]!, pointId)).tally).toEqual({
      inFavor: 2,
      against: 1,
      abstentions: 0,
    });
    await expect(assemblies.castVote(deps, manager, pointId, 'a_favor')).rejects.toThrow(
      VotingClosedError,
    );
  });

  it('voto duplicado rechazado también en carreras concurrentes (RNF-ASA-01)', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    const socio = await member('Socio', true);
    await assemblies.openVoting(deps, manager, pointId);

    const results = await Promise.allSettled(
      (['a_favor', 'en_contra', 'abstencion', 'a_favor', 'en_contra'] as const).map((choice) =>
        assemblies.castVote(deps, socio, pointId, choice),
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
    const socio = await member('Socio', true);
    await assemblies.openVoting(deps, manager, pointId);
    await assemblies.castVote(deps, socio, pointId, 'abstencion');

    const error = await assemblies
      .castVote(deps, socio, pointId, 'a_favor')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AlreadyVotedError);
    expect((error as AlreadyVotedError).choice).toBe('abstencion');
  });

  it('un socio dado de alta tras abrir la votación no puede votar (RN-ASA-02)', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    await assemblies.openVoting(deps, manager, pointId);
    const late = await member('Socio', true);

    await expect(assemblies.castVote(deps, late, pointId, 'a_favor')).rejects.toThrow(
      NotInCensusError,
    );
  });

  it('un gestor sin condición de socio no puede votar (RN-ACC-06)', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    const gestor = await member('Gestor', false);
    await assemblies.openVoting(deps, manager, pointId);

    await expect(assemblies.castVote(deps, gestor, pointId, 'a_favor')).rejects.toThrow(
      NotInCensusError,
    );
  });

  it('la base de datos rechaza un voto de alguien fuera del censo aunque el código fallara', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    await assemblies.openVoting(deps, manager, pointId);
    const voting = await prisma.voting.findUniqueOrThrow({ where: { pointId } });
    const outsider = await member('Socio', true);

    await expect(
      prisma.vote.create({
        data: { votingId: voting.id, membershipId: outsider.membershipId, choice: 'a_favor' },
      }),
    ).rejects.toThrow();
  });

  it('sin quórum en primera y con segunda convocatoria, se aplica la segunda (HU-ASA-07)', async () => {
    const draft = await assemblies.createAssembly(deps, manager, {
      type: 'ordinaria',
      firstCallAt: new Date(now.getTime() + 20 * DAY),
      secondCallAt: new Date(now.getTime() + 20 * DAY + 30 * 60 * 1000),
      place: 'Salón',
      points: [{ title: 'Cuentas', description: '', votable: true, majority: 'simple' }],
    });
    const assembly = await assemblies.conveneAssembly(deps, manager, draft.id);
    const pointId = assembly.points[0]!.id;
    await Promise.all([1, 2, 3].map(() => member('Socio', true)));
    await assemblies.openVoting(deps, manager, pointId);
    await assemblies.castVote(deps, manager, pointId, 'a_favor');

    const closed = await assemblies.closeVoting(deps, manager, pointId);

    // 1 de 4 votos = 25 % < 50 %: en segunda no hay mínimo.
    expect(closed.result).toMatchObject({
      call: 'segunda',
      quorumReached: true,
      outcome: 'aprobado',
    });
  });

  it('no se cierra la asamblea con votaciones abiertas; después sí', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;
    await assemblies.openVoting(deps, manager, pointId);

    await expect(assemblies.closeAssembly(deps, manager, assembly.id)).rejects.toThrow(
      /votaciones abiertas/,
    );
    await assemblies.closeVoting(deps, manager, pointId);
    await expect(assemblies.closeAssembly(deps, manager, assembly.id)).resolves.toMatchObject({
      status: 'celebrada',
    });
  });

  it('abrir dos veces a la vez solo abre una votación', async () => {
    const assembly = await convenedAssembly();
    const pointId = assembly.points[0]!.id;

    const results = await Promise.allSettled(
      [1, 2].map(() => assemblies.openVoting(deps, manager, pointId)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.voting.count()).toBe(1);
  });
});
