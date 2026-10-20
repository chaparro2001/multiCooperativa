import { listThirdPartiesResponseSchema, thirdPartySchema } from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { memberToken, TEST_PASSWORD } from '../../../../../test/members';
import { createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';

const env = loadEnv(process.env);
const prisma = createTestPrisma();
const invitationSender = { send: async () => {} };
const { app } = createApi({
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender,
  files: new InMemoryFileStorage(),
  embedder: new HashingEmbedder(),
  authRateLimits: false,
});

let coop: string;
let sea: string;
const tokens = { manager: '', board: '', member: '', seaManager: '' };
const as = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeEach(async () => {
  await resetDatabase(prisma);
  const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET, invitationSender });
  coop = (
    await access.provisionCooperative({
      name: 'Farm',
      cif: 'F12345674',
      admin: { email: 'admin@coop.test', name: 'Ana', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  sea = (
    await access.provisionCooperative({
      name: 'Sea',
      cif: 'F76543214',
      admin: { email: 'admin@sea.test', name: 'Rosa', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  const deps = { prisma, app };
  const common = { passwordOf: 'admin@coop.test' };
  tokens.manager = await memberToken(deps, {
    ...common,
    cooperativeId: coop,
    email: 'manager@coop.test',
    profileName: 'Gestor',
    isPartner: false,
  });
  tokens.board = await memberToken(deps, {
    ...common,
    cooperativeId: coop,
    email: 'board@coop.test',
    profileName: 'Consejo rector',
    isPartner: true,
  });
  tokens.member = await memberToken(deps, {
    ...common,
    cooperativeId: coop,
    email: 'member@coop.test',
    profileName: 'Socio',
    isPartner: true,
  });
  tokens.seaManager = await memberToken(deps, {
    ...common,
    cooperativeId: sea,
    email: 'manager@sea.test',
    profileName: 'Gestor',
    isPartner: false,
  });
});
afterAll(() => prisma.$disconnect());

const base = (id = coop) => `/cooperatives/${id}/third-parties`;
const fertilizers = {
  nif: 'b-12345674',
  name: 'Southern Fertilizers SL',
  isSupplier: true,
  isCustomer: false,
  email: 'orders@fertilizers.test',
  phone: null,
};

describe('third parties (US-INV-01)', () => {
  it('Given a valid unregistered NIF, when I save it, then it is available with the normalized NIF', async () => {
    const response = await request(app).post(base()).set(as('manager')).send(fertilizers);

    expect(response.status).toBe(201);
    expect(thirdPartySchema.parse(response.body)).toMatchObject({
      nif: 'B12345674',
      name: 'Southern Fertilizers SL',
      active: true,
    });
  });

  it('Given an already registered NIF, when I try to register it, then the existing one is offered and nothing is duplicated', async () => {
    const first = thirdPartySchema.parse(
      (await request(app).post(base()).set(as('manager')).send(fertilizers)).body,
    );

    const again = await request(app)
      .post(base())
      .set(as('manager'))
      .send({ ...fertilizers, nif: 'B 1234567-4', name: 'Other name' });

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({
      error: 'third_party_exists',
      details: { thirdPartyId: first.id, name: 'Southern Fertilizers SL' },
    });
    expect(await prisma.thirdParty.count()).toBe(1);
  });

  it('BR-INV-02: the same NIF can exist in another cooperative as a different third party', async () => {
    await request(app).post(base()).set(as('manager')).send(fertilizers);

    const other = await request(app).post(base(sea)).set(as('seaManager')).send(fertilizers);

    expect(other.status).toBe(201);
    expect(await prisma.thirdParty.count()).toBe(2);
  });

  it('a NIF with an incorrect check digit is rejected (NFR-INV-06)', async () => {
    const response = await request(app)
      .post(base())
      .set(as('manager'))
      .send({ ...fertilizers, nif: 'B12345675' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_third_party');
  });

  it('deactivating removes it from the active listing, which filters by type and text', async () => {
    const party = thirdPartySchema.parse(
      (await request(app).post(base()).set(as('manager')).send(fertilizers)).body,
    );
    await request(app)
      .post(base())
      .set(as('manager'))
      .send({ nif: '12345678Z', name: 'Northern Oil Mill', isSupplier: false, isCustomer: true });

    const suppliers = listThirdPartiesResponseSchema.parse(
      (await request(app).get(base()).query({ type: 'supplier' }).set(as('board'))).body,
    );
    expect(suppliers.items.map((p) => p.name)).toEqual(['Southern Fertilizers SL']);
    const byText = listThirdPartiesResponseSchema.parse(
      (await request(app).get(base()).query({ q: 'oil mill' }).set(as('board'))).body,
    );
    expect(byText.items.map((p) => p.name)).toEqual(['Northern Oil Mill']);

    const patched = await request(app).patch(`${base()}/${party.id}`).set(as('manager')).send({
      name: 'Southern Fertilizers SL',
      isSupplier: true,
      isCustomer: false,
      email: null,
      phone: null,
      active: false,
    });
    expect(thirdPartySchema.parse(patched.body).active).toBe(false);

    const active = listThirdPartiesResponseSchema.parse(
      (await request(app).get(base()).set(as('manager'))).body,
    );
    expect(active.items.map((p) => p.name)).toEqual(['Northern Oil Mill']);
    const all = listThirdPartiesResponseSchema.parse(
      (await request(app).get(base()).query({ inactive: 'true' }).set(as('manager'))).body,
    );
    expect(all.items).toHaveLength(2);
  });

  it('the board can read but cannot register; a member has no access (requirements/05, section 10)', async () => {
    expect((await request(app).get(base()).set(as('board'))).status).toBe(200);
    expect((await request(app).post(base()).set(as('board')).send(fertilizers)).status).toBe(403);
    expect((await request(app).get(base()).set(as('member'))).status).toBe(403);
  });

  it('a third party of another cooperative responds 404 even if the NIF matches', async () => {
    await request(app).post(base(sea)).set(as('seaManager')).send(fertilizers);
    const seaParty = await prisma.thirdParty.findFirstOrThrow({ where: { cooperativeId: sea } });

    const response = await request(app).get(`${base()}/${seaParty.id}`).set(as('manager'));

    expect(response.status).toBe(404);
  });
});
