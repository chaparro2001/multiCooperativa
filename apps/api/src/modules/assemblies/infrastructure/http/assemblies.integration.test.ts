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

const PASSWORD = 'a-long-password';
const env = loadEnv(process.env);
const prisma = createTestPrisma();
const events: AppEvent[] = [];
const bus = new InProcessEventBus<AppEvent>({ onHandlerError: () => {} });
for (const type of [
  'AssemblyConvened',
  'AssemblyRescheduled',
  'VotingOpened',
  'VotingClosed',
] as const) {
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

let fieldCoop: string;
const tokens: Record<'board' | 'member' | 'manager', string> = {
  board: '',
  member: '',
  manager: '',
};
const as = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });

async function addMember(email: string, profileName: string, isPartner: boolean) {
  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@field.test' },
  });
  const profile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: fieldCoop, name: profileName },
  });
  const user = await prisma.user.create({ data: { email, name: profileName, passwordHash } });
  await prisma.membership.create({
    data: {
      userId: user.id,
      cooperativeId: fieldCoop,
      profileId: profile.id,
      status: 'active',
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
  fieldCoop = (
    await access.provisionCooperative({
      name: 'Campo',
      cif: 'F12345674',
      admin: { email: 'admin@field.test', name: 'Ana', password: PASSWORD },
    })
  ).cooperativeId;
  tokens.board = await addMember('board@field.test', 'Consejo rector', true);
  tokens.member = await addMember('member@field.test', 'Socio', true);
  tokens.manager = await addMember('manager@field.test', 'Gestor', false);
});
afterAll(() => prisma.$disconnect());

const base = () => `/cooperatives/${fieldCoop}/assemblies`;
const point = (id: string) => `/cooperatives/${fieldCoop}/points/${id}`;
const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

async function convened() {
  const created = await request(app)
    .post(base())
    .set(as('board'))
    .send({
      type: 'ordinary',
      firstCallAt: inDays(20),
      secondCallAt: null,
      place: 'Social hall',
      points: [
        {
          title: 'Approval of accounts',
          description: 'Ejercicio 2025',
          votable: true,
          majority: 'simple',
        },
        { title: 'Informe del presidente', votable: false, majority: null },
      ],
    });
  const { id } = assemblySummarySchema.parse(created.body);
  await request(app).post(`${base()}/${id}/convene`).set(as('board'));
  const detail = assemblyDetailSchema.parse(
    (await request(app).get(`${base()}/${id}`).set(as('member'))).body,
  );
  return { id, pointId: detail.points[0]!.id, detail };
}

describe('assemblies over HTTP (US-ASM-01..06)', () => {
  it('convene -> open -> vote -> close, with the events of the specification', async () => {
    const { id, pointId, detail } = await convened();
    expect(detail.points.map((p) => [p.position, p.title, p.voting?.status ?? null])).toEqual([
      [1, 'Approval of accounts', 'pending'],
      [2, 'Informe del presidente', null],
    ]);

    const opened = votingViewSchema.parse(
      (
        await request(app)
          .post(`${point(pointId)}/voting/open`)
          .set(as('board'))
      ).body,
    );
    // Census: board member and member; the manager is not a partner and neither is the sign-up administrator.
    expect(opened).toMatchObject({ status: 'open', censusSize: 2 });

    const vote = await request(app)
      .post(`${point(pointId)}/voting/votes`)
      .set(as('member'))
      .send({ choice: 'in_favor' });
    expect(vote.status).toBe(201);
    expect(votingViewSchema.parse(vote.body)).toMatchObject({
      myVote: 'in_favor',
      canVote: false,
      tally: null,
    });

    const again = await request(app)
      .post(`${point(pointId)}/voting/votes`)
      .set(as('member'))
      .send({ choice: 'against' });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ error: 'already_voted', details: { choice: 'in_favor' } });

    const closed = votingViewSchema.parse(
      (
        await request(app)
          .post(`${point(pointId)}/voting/close`)
          .set(as('board'))
      ).body,
    );
    expect(closed.result).toMatchObject({
      outcome: 'approved',
      quorumReached: true,
      votesCast: 1,
      census: 2,
    });

    await request(app).post(`${base()}/${id}/close`).set(as('board'));
    const list = listAssembliesResponseSchema.parse(
      (await request(app).get(base()).set(as('member'))).body,
    );
    expect(list.items.map((a) => a.status)).toEqual(['held']);
    expect(events.map((e) => e.type)).toEqual(['AssemblyConvened', 'VotingOpened', 'VotingClosed']);
  });

  it('BR-ASM-11: with read access, while open only participation is visible', async () => {
    const { pointId } = await convened();
    await request(app)
      .post(`${point(pointId)}/voting/open`)
      .set(as('board'));
    await request(app)
      .post(`${point(pointId)}/voting/votes`)
      .set(as('board'))
      .send({ choice: 'against' });

    const asMember = votingViewSchema.parse(
      (
        await request(app)
          .get(`${point(pointId)}/voting`)
          .set(as('member'))
      ).body,
    );
    const asConsejo = votingViewSchema.parse(
      (
        await request(app)
          .get(`${point(pointId)}/voting`)
          .set(as('board'))
      ).body,
    );

    expect(asMember).toMatchObject({ votesCast: 1, tally: null, canVote: true });
    expect(asConsejo.tally).toEqual({ inFavor: 0, against: 1, abstentions: 0 });
  });

  it('Given a manager who is not a partner, when they try to vote, then they get 403', async () => {
    const { pointId } = await convened();
    await request(app)
      .post(`${point(pointId)}/voting/open`)
      .set(as('board'));

    const response = await request(app)
      .post(`${point(pointId)}/voting/votes`)
      .set(as('manager'))
      .send({ choice: 'in_favor' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('not_in_census');
  });

  it('with too little notice, convening answers 400 with the minimum notice', async () => {
    const created = await request(app)
      .post(base())
      .set(as('board'))
      .send({
        type: 'extraordinary',
        firstCallAt: inDays(3),
        secondCallAt: null,
        place: 'Hall',
        points: [{ title: 'X', votable: false, majority: null }],
      });
    const response = await request(app)
      .post(`${base()}/${created.body.id}/convene`)
      .set(as('board'));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'insufficient_notice',
      details: { minNoticeDays: 15 },
    });
  });

  it('drafts do not exist for someone with read access only', async () => {
    const created = await request(app)
      .post(base())
      .set(as('board'))
      .send({
        type: 'ordinary',
        firstCallAt: inDays(30),
        secondCallAt: null,
        place: 'Hall',
        points: [],
      });

    expect((await request(app).get(`${base()}/${created.body.id}`).set(as('member'))).status).toBe(
      404,
    );
    expect(
      listAssembliesResponseSchema.parse((await request(app).get(base()).set(as('member'))).body)
        .items,
    ).toEqual([]);
  });

  it('with read access, creating, convening and opening votings answer 403', async () => {
    const { id, pointId } = await convened();

    const responses = await Promise.all([
      request(app).post(base()).set(as('member')).send({}),
      request(app).post(`${base()}/${id}/cancel`).set(as('member')),
      request(app)
        .post(`${point(pointId)}/voting/open`)
        .set(as('member')),
    ]);

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403]);
  });

  it('a votable item without majority answers 400', async () => {
    const response = await request(app)
      .post(base())
      .set(as('board'))
      .send({
        type: 'ordinary',
        firstCallAt: inDays(20),
        secondCallAt: null,
        place: 'Hall',
        points: [{ title: 'Cuentas', votable: true, majority: null }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_assembly');
  });
});

describe('reschedule over HTTP (US-ASM-09, BR-ASM-12)', () => {
  const rescheduleUrl = (id: string) => `${base()}/${id}/reschedule`;
  const announcementsUrl = () => `/cooperatives/${fieldCoop}/announcements`;
  const body = (overrides: Record<string, unknown> = {}) => ({
    firstCallAt: inDays(40),
    secondCallAt: inDays(40.02),
    place: 'Casa de cultura',
    reason: 'La sala no está disponible',
    ...overrides,
  });
  const rescheduled = () => events.filter((e) => e.type === 'AssemblyRescheduled');

  it('moves a convened assembly, keeps the previous call, emits the event and announces it to members', async () => {
    const { id, detail } = await convened();

    const res = await request(app).post(rescheduleUrl(id)).set(as('board')).send(body());

    expect(res.status).toBe(200);
    expect(assemblySummarySchema.parse(res.body)).toMatchObject({
      status: 'convened',
      place: 'Casa de cultura',
    });
    const after = assemblyDetailSchema.parse(
      (await request(app).get(`${base()}/${id}`).set(as('member'))).body,
    );
    expect(after.rescheduledFrom).toMatchObject({
      firstCallAt: detail.firstCallAt,
      place: 'Social hall',
      reason: 'La sala no está disponible',
    });
    expect(after.points.map((p) => p.id)).toEqual(detail.points.map((p) => p.id));
    expect(rescheduled()).toHaveLength(1);

    const list = (await request(app).get(announcementsUrl()).set(as('member'))).body.items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Cambio de fecha: Asamblea ordinaria' });
    const shown = await request(app).get(`${announcementsUrl()}/${list[0].id}`).set(as('member'));
    expect(shown.body.body).toContain('Casa de cultura');
    expect(shown.body.body).toContain('Motivo: La sala no está disponible');
  });

  it('with notifyMembers=false no announcement is created', async () => {
    const { id } = await convened();

    const res = await request(app)
      .post(rescheduleUrl(id))
      .set(as('board'))
      .send(body({ notifyMembers: false }));

    expect(res.status).toBe(200);
    expect((await request(app).get(announcementsUrl()).set(as('member'))).body.items).toEqual([]);
  });

  it('read level answers 403; an unknown assembly 404', async () => {
    const { id } = await convened();

    const denied = await request(app).post(rescheduleUrl(id)).set(as('member')).send(body());
    expect(denied.status).toBe(403);
    const missing = await request(app)
      .post(rescheduleUrl('60000000-0000-4000-8000-000000000009'))
      .set(as('board'))
      .send(body());
    expect(missing.status).toBe(404);
  });

  it('a draft, or an assembly with a voting already opened, answers 409', async () => {
    const draft = await request(app)
      .post(base())
      .set(as('board'))
      .send({
        type: 'ordinary',
        firstCallAt: inDays(20),
        secondCallAt: null,
        place: 'Hall',
        points: [{ title: 'X', description: '', votable: false, majority: null }],
      });
    const draftId = assemblySummarySchema.parse(draft.body).id;
    const asDraft = await request(app).post(rescheduleUrl(draftId)).set(as('board')).send(body());
    expect(asDraft.status).toBe(409);
    expect(asDraft.body.error).toBe('invalid_assembly_transition');

    const { id, pointId } = await convened();
    await request(app)
      .post(`${point(pointId)}/voting/open`)
      .set(as('board'));
    const opened = await request(app).post(rescheduleUrl(id)).set(as('board')).send(body());
    expect(opened.status).toBe(409);
    expect(opened.body.error).toBe('voting_already_opened');

    await request(app)
      .post(`${point(pointId)}/voting/close`)
      .set(as('board'));
    const closed = await request(app).post(rescheduleUrl(id)).set(as('board')).send(body());
    expect(closed.body.error).toBe('voting_already_opened');
  });

  it('answers 400 with details.field for the notice, the second call and the place', async () => {
    const { id } = await convened();
    const send = (overrides: Record<string, unknown>) =>
      request(app).post(rescheduleUrl(id)).set(as('board')).send(body(overrides));

    const notice = await send({ firstCallAt: inDays(3), secondCallAt: null });
    expect(notice.status).toBe(400);
    expect(notice.body).toMatchObject({
      error: 'insufficient_notice',
      details: { field: 'firstCallAt', minNoticeDays: 15 },
    });
    const second = await send({ secondCallAt: inDays(39) });
    expect(second.body).toMatchObject({
      error: 'invalid_assembly',
      details: { field: 'secondCallAt' },
    });
    const place = await send({ place: '  ' });
    expect(place.body).toMatchObject({ error: 'invalid_assembly', details: { field: 'place' } });
    expect((await send({ firstCallAt: 'tomorrow' })).status).toBe(400);
    expect(rescheduled()).toEqual([]);
  });
});
