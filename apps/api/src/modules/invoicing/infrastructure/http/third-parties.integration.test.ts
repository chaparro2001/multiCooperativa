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

let campo: string;
let mar: string;
const tokens = { gestor: '', consejo: '', socio: '', marGestor: '' };
const as = (who: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeEach(async () => {
  await resetDatabase(prisma);
  const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET, invitationSender });
  campo = (
    await access.provisionCooperative({
      name: 'Campo',
      cif: 'F12345674',
      admin: { email: 'admin@campo.test', name: 'Ana', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  mar = (
    await access.provisionCooperative({
      name: 'Mar',
      cif: 'F76543214',
      admin: { email: 'admin@mar.test', name: 'Rosa', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  const deps = { prisma, app };
  const common = { passwordOf: 'admin@campo.test' };
  tokens.gestor = await memberToken(deps, {
    ...common,
    cooperativeId: campo,
    email: 'gestor@campo.test',
    profileName: 'Gestor',
    isPartner: false,
  });
  tokens.consejo = await memberToken(deps, {
    ...common,
    cooperativeId: campo,
    email: 'consejo@campo.test',
    profileName: 'Consejo rector',
    isPartner: true,
  });
  tokens.socio = await memberToken(deps, {
    ...common,
    cooperativeId: campo,
    email: 'socio@campo.test',
    profileName: 'Socio',
    isPartner: true,
  });
  tokens.marGestor = await memberToken(deps, {
    ...common,
    cooperativeId: mar,
    email: 'gestor@mar.test',
    profileName: 'Gestor',
    isPartner: false,
  });
});
afterAll(() => prisma.$disconnect());

const base = (coop = campo) => `/cooperativas/${coop}/terceros`;
const abonos = {
  nif: 'b-12345674',
  name: 'Abonos del Sur SL',
  isSupplier: true,
  isCustomer: false,
  email: 'pedidos@abonos.es',
  phone: null,
};

describe('terceros (HU-FAC-01)', () => {
  it('Dado un NIF válido no registrado, cuando lo guardo, entonces queda disponible con el NIF normalizado', async () => {
    const response = await request(app).post(base()).set(as('gestor')).send(abonos);

    expect(response.status).toBe(201);
    expect(thirdPartySchema.parse(response.body)).toMatchObject({
      nif: 'B12345674',
      name: 'Abonos del Sur SL',
      active: true,
    });
  });

  it('Dado un NIF ya registrado, cuando intento darlo de alta, entonces se me ofrece el existente y no se duplica', async () => {
    const first = thirdPartySchema.parse(
      (await request(app).post(base()).set(as('gestor')).send(abonos)).body,
    );

    const again = await request(app)
      .post(base())
      .set(as('gestor'))
      .send({ ...abonos, nif: 'B 1234567-4', name: 'Otro nombre' });

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({
      error: 'third_party_exists',
      details: { thirdPartyId: first.id, name: 'Abonos del Sur SL' },
    });
    expect(await prisma.thirdParty.count()).toBe(1);
  });

  it('RN-FAC-02: el mismo NIF puede existir en otra cooperativa como tercero distinto', async () => {
    await request(app).post(base()).set(as('gestor')).send(abonos);

    const other = await request(app).post(base(mar)).set(as('marGestor')).send(abonos);

    expect(other.status).toBe(201);
    expect(await prisma.thirdParty.count()).toBe(2);
  });

  it('un NIF con el dígito de control incorrecto se rechaza (RNF-FAC-06)', async () => {
    const response = await request(app)
      .post(base())
      .set(as('gestor'))
      .send({ ...abonos, nif: 'B12345675' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_third_party');
  });

  it('desactivar lo quita del listado de alta, que filtra por tipo y texto', async () => {
    const party = thirdPartySchema.parse(
      (await request(app).post(base()).set(as('gestor')).send(abonos)).body,
    );
    await request(app)
      .post(base())
      .set(as('gestor'))
      .send({ nif: '12345678Z', name: 'Almazara Norte', isSupplier: false, isCustomer: true });

    const suppliers = listThirdPartiesResponseSchema.parse(
      (await request(app).get(base()).query({ tipo: 'proveedor' }).set(as('consejo'))).body,
    );
    expect(suppliers.items.map((p) => p.name)).toEqual(['Abonos del Sur SL']);
    const byText = listThirdPartiesResponseSchema.parse(
      (await request(app).get(base()).query({ q: 'almaz' }).set(as('consejo'))).body,
    );
    expect(byText.items.map((p) => p.name)).toEqual(['Almazara Norte']);

    const patched = await request(app).patch(`${base()}/${party.id}`).set(as('gestor')).send({
      name: 'Abonos del Sur SL',
      isSupplier: true,
      isCustomer: false,
      email: null,
      phone: null,
      active: false,
    });
    expect(thirdPartySchema.parse(patched.body).active).toBe(false);

    const active = listThirdPartiesResponseSchema.parse(
      (await request(app).get(base()).set(as('gestor'))).body,
    );
    expect(active.items.map((p) => p.name)).toEqual(['Almazara Norte']);
    const all = listThirdPartiesResponseSchema.parse(
      (await request(app).get(base()).query({ inactivos: 'true' }).set(as('gestor'))).body,
    );
    expect(all.items).toHaveLength(2);
  });

  it('el consejo rector consulta pero no da de alta; un socio no accede (requisitos/05, apartado 10)', async () => {
    expect((await request(app).get(base()).set(as('consejo'))).status).toBe(200);
    expect((await request(app).post(base()).set(as('consejo')).send(abonos)).status).toBe(403);
    expect((await request(app).get(base()).set(as('socio'))).status).toBe(403);
  });

  it('un tercero de otra cooperativa responde 404 aunque el NIF coincida', async () => {
    await request(app).post(base(mar)).set(as('marGestor')).send(abonos);
    const marParty = await prisma.thirdParty.findFirstOrThrow({ where: { cooperativeId: mar } });

    const response = await request(app).get(`${base()}/${marParty.id}`).set(as('gestor'));

    expect(response.status).toBe(404);
  });
});
