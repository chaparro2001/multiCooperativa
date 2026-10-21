import {
  authTokensSchema,
  brandingSchema,
  listAuditResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { memberToken, TEST_PASSWORD } from '../../../../../test/members';
import { createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';

/** US-ACC-14, BR-ACC-16: per-cooperative branding (primary colour). */

const env = loadEnv(process.env);
const prisma = createTestPrisma();
const { app } = createApi({
  embedder: new HashingEmbedder(),
  prisma,
  jwtSecret: env.JWT_SECRET,
  files: new InMemoryFileStorage(),
  authRateLimits: false,
  invitationSender: { send: async () => {} },
});

let farm: string;
let sea: string;
let admin: string;
let manager: string;
let member: string;
let seaAdmin: string;

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const path = (suffix = '', cooperativeId = farm) =>
  `/cooperatives/${cooperativeId}/branding${suffix}`;

async function login(email: string) {
  const response = await request(app).post('/auth/login').send({ email, password: TEST_PASSWORD });
  return authTokensSchema.parse(response.body).accessToken;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  const access = createAccessModule({
    prisma,
    jwtSecret: env.JWT_SECRET,
    invitationSender: { send: async () => {} },
  });
  farm = (
    await access.provisionCooperative({
      name: 'Farm',
      cif: 'F12345674',
      admin: { email: 'admin@farm.test', name: 'Ana', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  sea = (
    await access.provisionCooperative({
      name: 'Sea',
      cif: 'F76543214',
      admin: { email: 'admin@sea.test', name: 'Rosa', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  const base = { prisma, app };
  member = await memberToken(base, {
    cooperativeId: farm,
    email: 'member@farm.test',
    profileName: 'Socio',
    isPartner: true,
    passwordOf: 'admin@farm.test',
  });
  manager = await memberToken(base, {
    cooperativeId: farm,
    email: 'manager@farm.test',
    profileName: 'Gestor',
    isPartner: false,
    passwordOf: 'admin@farm.test',
  });
  [admin, seaAdmin] = await Promise.all([login('admin@farm.test'), login('admin@sea.test')]);
});

describe('GET /cooperatives/{id}/branding (US-ACC-14)', () => {
  it('gives the defaults before anything is configured, to any member', async () => {
    for (const token of [admin, member, manager]) {
      const response = await request(app).get(path()).set(as(token));
      expect(response.status).toBe(200);
      expect(brandingSchema.parse(response.body)).toEqual({
        primaryColor: null,
        updatedAt: null,
      });
    }
  });

  it('shows every member the colour', async () => {
    await request(app).put(path('/primary-color')).set(as(admin)).send({ primaryColor: '#1e5aa8' });
    for (const token of [member, manager]) {
      const branding = brandingSchema.parse((await request(app).get(path()).set(as(token))).body);
      expect(branding.primaryColor).toBe('#1E5AA8');
    }
  });

  it('answers 404 to another cooperative and 401 without a token', async () => {
    expect((await request(app).get(path('', sea)).set(as(admin))).status).toBe(404);
    expect((await request(app).get(path()).set(as(seaAdmin))).status).toBe(404);
    expect((await request(app).get(path())).status).toBe(401);
  });
});

describe('PUT /cooperatives/{id}/branding/primary-color (US-ACC-14, BR-ACC-16)', () => {
  const put = (token: string, body: unknown, cooperativeId = farm) =>
    request(app)
      .put(path('/primary-color', cooperativeId))
      .set(as(token))
      .send(body as object);

  it('saves the colour, shows it to the cooperative only, and audits it', async () => {
    const response = await put(admin, { primaryColor: '#1e5aa8' });
    expect(response.status).toBe(200);
    expect(brandingSchema.parse(response.body).primaryColor).toBe('#1E5AA8');

    const other = await request(app).get(path('', sea)).set(as(seaAdmin));
    expect(brandingSchema.parse(other.body).primaryColor).toBeNull();

    const audit = await request(app).get(`/cooperatives/${farm}/audit`).set(as(admin));
    const event = listAuditResponseSchema
      .parse(audit.body)
      .events.find((candidate) => candidate.action === 'cooperative.branding_changed');
    expect(event?.detail).toEqual({ primaryColor: { from: null, to: '#1E5AA8' } });
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@farm.test' } });
    expect(event?.actorUserId).toBe(adminUser.id);
  });

  it('refuses a low-contrast colour with 422 and the computed ratio, saving nothing', async () => {
    const response = await put(admin, { primaryColor: '#FFE066' });
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('insufficient_contrast');
    expect(response.body.details.ratio).toBeCloseTo(1.3, 2);
    expect(response.body.details.minimum).toBe(4.5);
    expect(await prisma.cooperativeBranding.count()).toBe(0);
  });

  it('goes back to the default with null', async () => {
    await put(admin, { primaryColor: '#1E5AA8' });
    const response = await put(admin, { primaryColor: null });
    expect(brandingSchema.parse(response.body).primaryColor).toBeNull();
  });

  it('rejects a malformed body (400)', async () => {
    for (const body of [
      {},
      { primaryColor: 'blue' },
      { primaryColor: '#12345' },
      { primaryColor: 5 },
    ]) {
      expect((await put(admin, body)).status).toBe(400);
    }
  });

  it('answers 403 to profiles without the users module and saves nothing', async () => {
    for (const token of [member, manager]) {
      const response = await put(token, { primaryColor: '#1E5AA8' });
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
    }
    expect(await prisma.cooperativeBranding.count()).toBe(0);
  });

  it('answers 404 for another cooperative and saves nothing', async () => {
    expect((await put(admin, { primaryColor: '#1E5AA8' }, sea)).status).toBe(404);
    expect(await prisma.cooperativeBranding.count()).toBe(0);
  });
});
