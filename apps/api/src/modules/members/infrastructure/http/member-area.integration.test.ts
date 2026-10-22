import {
  authTokensSchema,
  listMembersCapitalResponseSchema,
  memberMovementsResponseSchema,
  myMemberAreaResponseSchema,
  registerCapitalMovementResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { memberToken } from '../../../../../test/members';
import { createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';

const PASSWORD = 'una-clave-larga';
const env = loadEnv(process.env);
const prisma = createTestPrisma();
const invitationSender = { send: async () => {} };
const { app } = createApi({
  embedder: new HashingEmbedder(),
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender,
  files: new InMemoryFileStorage(),
  authRateLimits: false,
});

let fieldCoop: string;
let seaCoop: string;
let adminToken: string;
let seaAdminToken: string;
let ana: string; // member, "own" scope
let ben: string; // member
let board: string;
let manager: string;
let anaId: string;
let benId: string;
let seaMemberId: string;

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const area = (coop = fieldCoop) => `/cooperatives/${coop}/member-area`;
const movement = (overrides: object = {}) => ({
  date: '2026-10-05',
  type: 'mandatory_contribution',
  concept: 'Contribution',
  amount: '600.00',
  ...overrides,
});
const register = (token: string, membershipId: string, body: object, coop = fieldCoop) =>
  request(app)
    .post(`${area(coop)}/members/${membershipId}/movements`)
    .set(as(token))
    .send(body);

afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await resetDatabase(prisma);
  const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET, invitationSender });
  fieldCoop = (
    await access.provisionCooperative({
      name: 'Campo',
      cif: 'F12345674',
      admin: { email: 'admin@field.test', name: 'Ana', password: PASSWORD },
    })
  ).cooperativeId;
  seaCoop = (
    await access.provisionCooperative({
      name: 'Mar',
      cif: 'F76543214',
      admin: { email: 'admin@sea.test', name: 'Rosa', password: PASSWORD },
    })
  ).cooperativeId;
  const login = async (email: string) =>
    authTokensSchema.parse(
      (await request(app).post('/auth/login').send({ email, password: PASSWORD })).body,
    ).accessToken;
  adminToken = await login('admin@field.test');
  seaAdminToken = await login('admin@sea.test');
  const deps = { prisma, app };
  const common = { passwordOf: 'admin@field.test' };
  ana = await memberToken(deps, {
    ...common,
    cooperativeId: fieldCoop,
    email: 'ana@field.test',
    profileName: 'Socio',
    isPartner: true,
  });
  ben = await memberToken(deps, {
    ...common,
    cooperativeId: fieldCoop,
    email: 'ben@field.test',
    profileName: 'Socio',
    isPartner: true,
  });
  board = await memberToken(deps, {
    ...common,
    cooperativeId: fieldCoop,
    email: 'board@field.test',
    profileName: 'Consejo rector',
    isPartner: true,
  });
  manager = await memberToken(deps, {
    ...common,
    cooperativeId: fieldCoop,
    email: 'manager@field.test',
    profileName: 'Gestor',
    isPartner: false,
  });
  const idOf = async (email: string, cooperativeId = fieldCoop) =>
    (
      await prisma.membership.findFirstOrThrow({
        where: { cooperativeId, user: { email } },
      })
    ).id;
  anaId = await idOf('ana@field.test');
  benId = await idOf('ben@field.test');
  // A partner of the sea cooperative, to aim at from the field one.
  await memberToken(deps, {
    ...common,
    cooperativeId: seaCoop,
    email: 'sea-member@sea.test',
    profileName: 'Socio',
    isPartner: true,
  });
  seaMemberId = await idOf('sea-member@sea.test', seaCoop);
});

describe('US-MEM-01 / US-MEM-02 · my record and my movements', () => {
  it('US-MEM-01: a member sees their record', async () => {
    const response = await request(app).get(`${area()}/me`).set(as(ana));

    expect(response.status).toBe(200);
    const body = myMemberAreaResponseSchema.parse(response.body);
    expect(body.member).toMatchObject({
      membershipId: anaId,
      email: 'ana@field.test',
      profileName: 'Socio',
      isPartner: true,
    });
    expect(body.capital).toBe('0.00');
  });

  it('US-MEM-01: the joining date is the recorded one, or the creation date of the membership', async () => {
    const created = (await prisma.membership.findUniqueOrThrow({ where: { id: anaId } })).createdAt;
    const before = await request(app).get(`${area()}/me`).set(as(ana));
    expect(myMemberAreaResponseSchema.parse(before.body).member.joinedAt).toBe(
      created.toISOString().slice(0, 10),
    );

    await prisma.membership.update({
      where: { id: anaId },
      data: { joinedAt: new Date('2019-05-04T00:00:00Z') },
    });
    const after = await request(app).get(`${area()}/me`).set(as(ana));
    expect(myMemberAreaResponseSchema.parse(after.body).member.joinedAt).toBe('2019-05-04');
  });

  it('US-MEM-02: with no movements the capital is zero and the list empty', async () => {
    const response = await request(app).get(`${area()}/me/movements`).set(as(ana));

    const body = memberMovementsResponseSchema.parse(response.body);
    expect(body.capital).toBe('0.00');
    expect(body.movements).toEqual([]);
  });

  it('US-MEM-02: the movements and the capital are exact, newest first', async () => {
    await register(manager, anaId, movement({ date: '2026-01-10', amount: '600.10' }));
    await register(
      manager,
      anaId,
      movement({ date: '2026-02-10', type: 'refund', concept: 'Refund', amount: '0.20' }),
    );

    const response = await request(app).get(`${area()}/me/movements`).set(as(ana));

    const body = memberMovementsResponseSchema.parse(response.body);
    expect(body.capital).toBe('599.90');
    expect(body.movements.map((m) => [m.date, m.type, m.amount])).toEqual([
      ['2026-02-10', 'refund', '0.20'],
      ['2026-01-10', 'mandatory_contribution', '600.10'],
    ]);
  });

  it('US-MEM-02: movements come in keyset pages; the capital is the whole sum on every page', async () => {
    // Same date for the last three: recordedAt, then the id, keep the order stable.
    await register(manager, anaId, movement({ date: '2026-01-10', amount: '100.00' }));
    for (const amount of ['10.00', '20.00', '30.00']) {
      await register(manager, anaId, movement({ date: '2026-02-10', amount }));
    }

    const fetchPage = (before?: string) =>
      request(app)
        .get(`${area()}/me/movements`)
        .query({ limit: 2, ...(before && { before }) })
        .set(as(ana));
    const first = memberMovementsResponseSchema.parse((await fetchPage()).body);
    const second = memberMovementsResponseSchema.parse((await fetchPage(first.nextCursor!)).body);

    expect([first.capital, second.capital]).toEqual(['160.00', '160.00']);
    expect(first.movements.map((m) => m.amount)).toEqual(['30.00', '20.00']);
    expect(second.movements.map((m) => m.amount)).toEqual(['10.00', '100.00']);
    expect(second.nextCursor).toBeNull();
    expect((await fetchPage('bogus')).status).toBe(400);

    const viaMember = await request(app)
      .get(`${area()}/members/${anaId}/movements`)
      .query({ limit: 1 })
      .set(as(board));
    const body = memberMovementsResponseSchema.parse(viaMember.body);
    expect(body.capital).toBe('160.00');
    expect(body.nextCursor).not.toBeNull();
  });

  it('US-MEM-01: a manager who is not a partner also has a record, with no capital', async () => {
    const response = await request(app).get(`${area()}/me`).set(as(manager));

    expect(myMemberAreaResponseSchema.parse(response.body).member.isPartner).toBe(false);
  });

  it('US-ACC-07: without a session it is 401', async () => {
    expect((await request(app).get(`${area()}/me`)).status).toBe(401);
  });
});

describe('double isolation (US-MEM-01, ADR-003)', () => {
  it('a member does not see another member of their cooperative (404)', async () => {
    await register(manager, benId, movement());

    const response = await request(app).get(`${area()}/members/${benId}/movements`).set(as(ana));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found', message: 'Not found.' });
  });

  it('each member only gets their own capital from the "me" routes', async () => {
    await register(manager, anaId, movement({ amount: '600.00', concept: 'Ana only' }));
    await register(manager, benId, movement({ amount: '75.00', concept: 'Ben only' }));

    const response = await request(app).get(`${area()}/me/movements`).set(as(ben));

    const body = memberMovementsResponseSchema.parse(response.body);
    expect(body.capital).toBe('75.00');
    expect(body.movements.map((m) => m.concept)).toEqual(['Ben only']);
  });

  it('a member can read their own movements through the member route', async () => {
    const response = await request(app).get(`${area()}/members/${anaId}/movements`).set(as(ana));
    expect(response.status).toBe(200);
  });

  it('a member cannot list the members (403)', async () => {
    const response = await request(app).get(`${area()}/members`).set(as(ana));
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('forbidden');
  });

  it('the administrator of another cooperative gets 404 for a member and for registering', async () => {
    expect(
      (await request(app).get(`${area()}/members/${anaId}/movements`).set(as(seaAdminToken)))
        .status,
    ).toBe(404);
    expect((await request(app).get(`${area()}/members`).set(as(seaAdminToken)).send()).status).toBe(
      404,
    );
    expect((await register(seaAdminToken, anaId, movement(), seaCoop)).status).toBe(404);
    expect(await prisma.capitalMovement.count()).toBe(0);
  });

  it('a member of another cooperative cannot be reached from your own (404)', async () => {
    expect(
      (await request(app).get(`${area()}/members/${seaMemberId}/movements`).set(as(adminToken)))
        .status,
    ).toBe(404);
    expect((await register(adminToken, seaMemberId, movement())).status).toBe(404);
    expect(await prisma.capitalMovement.count()).toBe(0);
  });

  it('the list of one cooperative never includes the capital of the other', async () => {
    await register(manager, anaId, movement({ amount: '100.00' }));
    const seaMember = await prisma.membership.findFirstOrThrow({
      where: { cooperativeId: seaCoop, user: { email: 'sea-member@sea.test' } },
    });
    await register(seaAdminToken, seaMember.id, movement({ amount: '999.00' }), seaCoop);

    const response = await request(app).get(`${area()}/members`).set(as(board));

    const body = listMembersCapitalResponseSchema.parse(response.body);
    expect(body.totalCapital).toBe('100.00');
    expect(body.items.map((item) => item.member.email)).not.toContain('sea-member@sea.test');
  });
});

describe('US-MEM-04 · the capital of all members', () => {
  it('the board lists every partner with their capital and the cooperative total', async () => {
    await register(manager, anaId, movement({ amount: '600.00' }));
    await register(manager, benId, movement({ amount: '250.50' }));

    const response = await request(app).get(`${area()}/members`).set(as(board));

    expect(response.status).toBe(200);
    const body = listMembersCapitalResponseSchema.parse(response.body);
    expect(body.items.map((item) => [item.member.email, item.capital]).sort()).toEqual([
      ['ana@field.test', '600.00'],
      ['ben@field.test', '250.50'],
      ['board@field.test', '0.00'],
    ]);
    expect(body.totalCapital).toBe('850.50');
  });

  it('the board reads the movements of any member', async () => {
    await register(manager, benId, movement());

    const response = await request(app).get(`${area()}/members/${benId}/movements`).set(as(board));

    expect(memberMovementsResponseSchema.parse(response.body).movements).toHaveLength(1);
  });

  it('a manager (manage, all) lists too, and so does the administrator', async () => {
    expect((await request(app).get(`${area()}/members`).set(as(manager))).status).toBe(200);
    expect((await request(app).get(`${area()}/members`).set(as(adminToken))).status).toBe(200);
  });
});

describe('US-MEM-03 · registering movements', () => {
  it('US-MEM-03: a manager registers a contribution and the capital is recalculated', async () => {
    const response = await register(manager, anaId, movement({ amount: '600.00' }));

    expect(response.status).toBe(201);
    const body = registerCapitalMovementResponseSchema.parse(response.body);
    expect(body.capital).toBe('600.00');
    const stored = await prisma.capitalMovement.findFirstOrThrow();
    expect(stored.cooperativeId).toBe(fieldCoop);
    expect(stored.membershipId).toBe(anaId);
    const recorder = await prisma.membership.findFirstOrThrow({
      where: { user: { email: 'manager@field.test' } },
    });
    expect(stored.recordedByMembershipId).toBe(recorder.id);
  });

  it('US-MEM-03: the administrator registers too', async () => {
    expect((await register(adminToken, anaId, movement())).status).toBe(201);
  });

  it('US-MEM-03: the governing board reads but does not register (403) and nothing is stored', async () => {
    const response = await register(board, anaId, movement());

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('forbidden');
    expect(await prisma.capitalMovement.count()).toBe(0);
  });

  it('US-MEM-03: a member cannot register, not even for themselves (403)', async () => {
    expect((await register(ana, anaId, movement())).status).toBe(403);
    expect(await prisma.capitalMovement.count()).toBe(0);
  });

  it('US-MEM-03: a refund greater than the available capital is rejected with the available capital', async () => {
    await register(manager, anaId, movement({ amount: '100.00' }));

    const response = await register(
      manager,
      anaId,
      movement({ type: 'refund', concept: 'Leaving', amount: '100.01' }),
    );

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'insufficient_capital',
      details: { available: '100.00' },
    });
    expect(await prisma.capitalMovement.count()).toBe(1);
  });

  it('BR-MEM-03: a refund of exactly the capital leaves zero', async () => {
    await register(manager, anaId, movement({ amount: '100.00' }));

    const response = await register(manager, anaId, movement({ type: 'refund', amount: '100.00' }));

    expect(registerCapitalMovementResponseSchema.parse(response.body).capital).toBe('0.00');
  });

  it('BR-MEM-03: two simultaneous refunds cannot both pass the check', async () => {
    await register(manager, anaId, movement({ amount: '100.00' }));

    const responses = await Promise.all([
      register(manager, anaId, movement({ type: 'refund', amount: '60.00' })),
      register(manager, anaId, movement({ type: 'refund', amount: '60.00' })),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const mine = await request(app).get(`${area()}/me/movements`).set(as(ana));
    expect(memberMovementsResponseSchema.parse(mine.body).capital).toBe('40.00');
  });

  it('BR-MEM-01: a mistake is corrected with a movement of opposite sign', async () => {
    await register(manager, anaId, movement({ amount: '500.00' }));

    const response = await register(
      manager,
      anaId,
      movement({ type: 'correction', concept: 'Wrong amount', amount: '-500.00' }),
    );

    expect(registerCapitalMovementResponseSchema.parse(response.body).capital).toBe('0.00');
  });

  it('BR-MEM-04: a request that breaks the contract is 400 and a domain violation is 400 invalid_movement', async () => {
    const malformed = await register(manager, anaId, { ...movement(), amount: 10 });
    expect(malformed.status).toBe(400);
    expect(malformed.body.error).toBe('invalid_request');

    for (const body of [
      movement({ amount: '0.00' }),
      movement({ amount: '-5.00' }),
      movement({ concept: '   ' }),
    ]) {
      const response = await register(manager, anaId, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error).toBe('invalid_movement');
    }
    // An impossible date does not even pass the contract.
    const impossible = await register(manager, anaId, movement({ date: '2026-02-30' }));
    expect(impossible.status).toBe(400);
    expect(await prisma.capitalMovement.count()).toBe(0);
  });

  it('US-MEM-03: a non-partner and a malformed id are 404', async () => {
    const managerMembership = await prisma.membership.findFirstOrThrow({
      where: { user: { email: 'manager@field.test' } },
    });
    expect((await register(manager, managerMembership.id, movement())).status).toBe(404);
    expect((await register(manager, 'not-a-uuid', movement())).status).toBe(404);
  });
});

describe('BR-MEM-01 · immutability in the database', () => {
  it('refuses UPDATE and DELETE of a movement', async () => {
    await register(manager, anaId, movement());
    const stored = await prisma.capitalMovement.findFirstOrThrow();

    await expect(
      prisma.capitalMovement.update({ where: { id: stored.id }, data: { amount: '1.00' } }),
    ).rejects.toThrow(/immutable/);
    await expect(prisma.capitalMovement.delete({ where: { id: stored.id } })).rejects.toThrow(
      /immutable/,
    );
  });

  it('BR-MEM-03: the database refuses a zero amount or a negative contribution', async () => {
    const base = {
      cooperativeId: fieldCoop,
      membershipId: anaId,
      date: new Date('2026-01-01'),
      concept: 'x',
      recordedByMembershipId: benId,
    };
    await expect(
      prisma.capitalMovement.create({ data: { ...base, type: 'refund', amount: '-1.00' } }),
    ).rejects.toThrow();
    await expect(
      prisma.capitalMovement.create({ data: { ...base, type: 'correction', amount: '0.00' } }),
    ).rejects.toThrow();
    await expect(
      prisma.capitalMovement.create({ data: { ...base, type: 'correction', amount: '-1.00' } }),
    ).resolves.toBeDefined();
  });
});
