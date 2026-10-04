import {
  assemblyDetailSchema,
  assemblySummarySchema,
  authTokensSchema,
  listAssembliesResponseSchema,
  votingViewSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { type AppEvent, createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InProcessEventBus } from '../../../../shared/events';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';

const PASSWORD = 'una-clave-larga';
const env = loadEnv(process.env);
const prisma = createTestPrisma();
const events: AppEvent[] = [];
const bus = new InProcessEventBus<AppEvent>({ onHandlerError: () => {} });
for (const type of ['AsambleaConvocada', 'VotacionAbierta', 'VotacionCerrada'] as const) {
  bus.subscribe(type, (event) => void events.push(event));
}
const invitationSender = { send: async () => {} };
const { app } = createApi({
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender,
  files: new InMemoryFileStorage(),
  embedder: new HashingEmbedder(),
  events: bus,
  authRateLimits: false,
});

let campo: string;
const tokens: Record<'consejo' | 'socio' | 'gestor', string> = {
  consejo: '',
  socio: '',
  gestor: '',
};
const as = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });

async function addMember(email: string, profileName: string, isPartner: boolean) {
  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@campo.test' },
  });
  const profile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: campo, name: profileName },
  });
  const user = await prisma.user.create({ data: { email, name: profileName, passwordHash } });
  await prisma.membership.create({
    data: {
      userId: user.id,
      cooperativeId: campo,
      profileId: profile.id,
      status: 'activa',
      isPartner,
    },
  });
  const login = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  return authTokensSchema.parse(login.body).accessToken;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  events.length = 0;
  const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET, invitationSender });
  campo = (
    await access.provisionCooperative({
      name: 'Campo',
      cif: 'F12345674',
      admin: { email: 'admin@campo.test', name: 'Ana', password: PASSWORD },
    })
  ).cooperativeId;
  tokens.consejo = await addMember('consejo@campo.test', 'Consejo rector', true);
  tokens.socio = await addMember('socio@campo.test', 'Socio', true);
  tokens.gestor = await addMember('gestor@campo.test', 'Gestor', false);
});
afterAll(() => prisma.$disconnect());

const base = () => `/cooperativas/${campo}/asambleas`;
const point = (id: string) => `/cooperativas/${campo}/puntos/${id}`;
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

async function convened() {
  const created = await request(app)
    .post(base())
    .set(as('consejo'))
    .send({
      type: 'ordinaria',
      firstCallAt: inDays(20),
      secondCallAt: null,
      place: 'Salón social',
      points: [
        {
          title: 'Aprobación de cuentas',
          description: 'Ejercicio 2025',
          votable: true,
          majority: 'simple',
        },
        { title: 'Informe del presidente', votable: false, majority: null },
      ],
    });
  const { id } = assemblySummarySchema.parse(created.body);
  await request(app).post(`${base()}/${id}/convocar`).set(as('consejo'));
  const detail = assemblyDetailSchema.parse(
    (await request(app).get(`${base()}/${id}`).set(as('socio'))).body,
  );
  return { id, pointId: detail.points[0]!.id, detail };
}

describe('asambleas por HTTP (HU-ASA-01..06)', () => {
  it('convocar → abrir → votar → cerrar, con los eventos de la especificación', async () => {
    const { id, pointId, detail } = await convened();
    expect(detail.points.map((p) => [p.position, p.title, p.voting?.status ?? null])).toEqual([
      [1, 'Aprobación de cuentas', 'pendiente'],
      [2, 'Informe del presidente', null],
    ]);

    const opened = votingViewSchema.parse(
      (
        await request(app)
          .post(`${point(pointId)}/votacion/abrir`)
          .set(as('consejo'))
      ).body,
    );
    // Censo: consejero y socio; el gestor no es socio y el administrador del alta tampoco.
    expect(opened).toMatchObject({ status: 'abierta', censusSize: 2 });

    const vote = await request(app)
      .post(`${point(pointId)}/votacion/votos`)
      .set(as('socio'))
      .send({ choice: 'a_favor' });
    expect(vote.status).toBe(201);
    expect(votingViewSchema.parse(vote.body)).toMatchObject({
      myVote: 'a_favor',
      canVote: false,
      tally: null,
    });

    const again = await request(app)
      .post(`${point(pointId)}/votacion/votos`)
      .set(as('socio'))
      .send({ choice: 'en_contra' });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: 'already_voted', details: { choice: 'a_favor' } });

    const closed = votingViewSchema.parse(
      (
        await request(app)
          .post(`${point(pointId)}/votacion/cerrar`)
          .set(as('consejo'))
      ).body,
    );
    expect(closed.result).toMatchObject({
      outcome: 'aprobado',
      quorumReached: true,
      votesCast: 1,
      census: 2,
    });

    await request(app).post(`${base()}/${id}/cerrar`).set(as('consejo'));
    const list = listAssembliesResponseSchema.parse(
      (await request(app).get(base()).set(as('socio'))).body,
    );
    expect(list.items.map((a) => a.status)).toEqual(['celebrada']);
    expect(events.map((e) => e.type)).toEqual([
      'AsambleaConvocada',
      'VotacionAbierta',
      'VotacionCerrada',
    ]);
  });

  it('RN-ASA-11: con consulta, mientras está abierta solo se ve la participación', async () => {
    const { pointId } = await convened();
    await request(app)
      .post(`${point(pointId)}/votacion/abrir`)
      .set(as('consejo'));
    await request(app)
      .post(`${point(pointId)}/votacion/votos`)
      .set(as('consejo'))
      .send({ choice: 'en_contra' });

    const asSocio = votingViewSchema.parse(
      (
        await request(app)
          .get(`${point(pointId)}/votacion`)
          .set(as('socio'))
      ).body,
    );
    const asConsejo = votingViewSchema.parse(
      (
        await request(app)
          .get(`${point(pointId)}/votacion`)
          .set(as('consejo'))
      ).body,
    );

    expect(asSocio).toMatchObject({ votesCast: 1, tally: null, canVote: true });
    expect(asConsejo.tally).toEqual({ inFavor: 0, against: 1, abstentions: 0 });
  });

  it('Dado un gestor sin condición de socio, cuando intenta votar, entonces recibe 403', async () => {
    const { pointId } = await convened();
    await request(app)
      .post(`${point(pointId)}/votacion/abrir`)
      .set(as('consejo'));

    const response = await request(app)
      .post(`${point(pointId)}/votacion/votos`)
      .set(as('gestor'))
      .send({ choice: 'a_favor' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('not_in_census');
  });

  it('con poca antelación, convocar responde 400 con la antelación mínima', async () => {
    const created = await request(app)
      .post(base())
      .set(as('consejo'))
      .send({
        type: 'extraordinaria',
        firstCallAt: inDays(3),
        secondCallAt: null,
        place: 'Salón',
        points: [{ title: 'X', votable: false, majority: null }],
      });
    const response = await request(app)
      .post(`${base()}/${created.body.id}/convocar`)
      .set(as('consejo'));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'insufficient_notice',
      details: { minNoticeDays: 15 },
    });
  });

  it('los borradores no existen para quien solo consulta', async () => {
    const created = await request(app)
      .post(base())
      .set(as('consejo'))
      .send({
        type: 'ordinaria',
        firstCallAt: inDays(30),
        secondCallAt: null,
        place: 'Salón',
        points: [],
      });

    expect((await request(app).get(`${base()}/${created.body.id}`).set(as('socio'))).status).toBe(
      404,
    );
    expect(
      listAssembliesResponseSchema.parse((await request(app).get(base()).set(as('socio'))).body)
        .items,
    ).toEqual([]);
  });

  it('con consulta, crear, convocar y abrir votaciones responden 403', async () => {
    const { id, pointId } = await convened();

    const responses = await Promise.all([
      request(app).post(base()).set(as('socio')).send({}),
      request(app).post(`${base()}/${id}/cancelar`).set(as('socio')),
      request(app)
        .post(`${point(pointId)}/votacion/abrir`)
        .set(as('socio')),
    ]);

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403]);
  });

  it('un punto votable sin mayoría responde 400', async () => {
    const response = await request(app)
      .post(base())
      .set(as('consejo'))
      .send({
        type: 'ordinaria',
        firstCallAt: inDays(20),
        secondCallAt: null,
        place: 'Salón',
        points: [{ title: 'Cuentas', votable: true, majority: null }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_assembly');
  });
});
