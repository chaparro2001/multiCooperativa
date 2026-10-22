import {
  authTokensSchema,
  meResponseSchema,
  myPermissionsResponseSchema,
} from '@multicooperativa/contracts';
import { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { createApp } from '../../../../app';
import { loadEnv } from '../../../../config/env';
import {
  type AuthRateLimits,
  createAccessModule,
  getCooperativeContext,
  requireAccess,
  requirePermission,
} from '../../index';

const prisma = createTestPrisma();
const jwtSecret = loadEnv(process.env).JWT_SECRET;

function buildApp(authRateLimits: AuthRateLimits | false = false) {
  const access = createAccessModule({
    prisma,
    jwtSecret,
    authRateLimits,
    invitationSender: { send: async () => {} },
  });

  // Stand-in for another module's router, wired the way real modules will be.
  const invoices = Router();
  invoices.get(
    '/cooperatives/:cooperativeId/invoices',
    access.requireCooperative,
    requirePermission('invoicing', 'read'),
    (_req, res) => {
      const context = getCooperativeContext(res);
      const scope = requireAccess(context.permissions, 'invoicing', 'read');
      res.json({ cooperativeId: context.cooperativeId, scope });
    },
  );

  const app = createApp({
    routers: [access.router, invoices],
    errorHandlers: [access.errorHandler],
    // As behind Railway's proxy: X-Forwarded-For decides the client IP.
    trustProxy: 1,
  });
  return { app, access };
}

let app: ReturnType<typeof buildApp>['app'];
let access: ReturnType<typeof buildApp>['access'];
let fieldCoop: string;
let seaCoop: string;

const PASSWORD = 'a-long-password';

beforeEach(async () => {
  await resetDatabase(prisma);
  ({ app, access } = buildApp());
  fieldCoop = (
    await access.provisionCooperative({
      name: 'Cooperativa del Campo',
      cif: 'F12345678',
      admin: { email: 'admin@campo.es', name: 'Ada', password: PASSWORD },
    })
  ).cooperativeId;
  seaCoop = (
    await access.provisionCooperative({
      name: 'Cooperativa del Mar',
      cif: 'F87654321',
      admin: { email: 'admin@mar.es', name: 'Grace', password: PASSWORD },
    })
  ).cooperativeId;
});
afterAll(() => prisma.$disconnect());

/** Adds an active member with a predefined profile to the given cooperative. */
async function addMember(email: string, cooperativeId: string, profileName: string) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: email,
      passwordHash: (await prisma.user.findFirstOrThrow()).passwordHash,
    },
  });
  const profile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId, name: profileName },
  });
  return prisma.membership.create({
    data: {
      userId: user.id,
      cooperativeId,
      profileId: profile.id,
      status: 'active',
      isPartner: true,
    },
  });
}

async function loginAs(email: string) {
  const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  return authTokensSchema.parse(response.body);
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('GET /me (US-ACC-05)', () => {
  it('returns the user and their active memberships', async () => {
    await addMember('admin@campo.es', seaCoop, 'Socio');
    const { accessToken } = await loginAs('admin@campo.es');

    const response = await request(app).get('/me').set(bearer(accessToken));

    expect(response.status).toBe(200);
    const me = meResponseSchema.parse(response.body);
    expect(me).toMatchObject({ email: 'admin@campo.es', name: 'Ada' });
    expect(me.memberships.map((m) => [m.cooperativeName, m.profileName])).toEqual([
      ['Cooperativa del Campo', 'Administrador'],
      ['Cooperativa del Mar', 'Socio'],
    ]);
  });

  it('includes each cooperative brand colour, null when it has no branding (US-ACC-14)', async () => {
    await addMember('admin@campo.es', seaCoop, 'Socio');
    await prisma.cooperativeBranding.create({
      data: { cooperativeId: seaCoop, primaryColor: '#7A1F5C' },
    });
    const { accessToken } = await loginAs('admin@campo.es');

    const response = await request(app).get('/me').set(bearer(accessToken));

    const me = meResponseSchema.parse(response.body);
    expect(me.memberships.map((m) => [m.cooperativeName, m.primaryColor])).toEqual([
      ['Cooperativa del Campo', null],
      ['Cooperativa del Mar', '#7A1F5C'],
    ]);
  });

  it('does not include suspended memberships', async () => {
    const membership = await addMember('admin@campo.es', seaCoop, 'Socio');
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: 'suspended' },
    });
    const { accessToken } = await loginAs('admin@campo.es');

    const me = meResponseSchema.parse(
      (await request(app).get('/me').set(bearer(accessToken))).body,
    );

    expect(me.memberships.map((m) => m.cooperativeId)).toEqual([fieldCoop]);
  });
});

describe('GET /cooperatives/{id}/me/permissions (US-ACC-06)', () => {
  it('returns the profile, the partner condition and the effective permissions', async () => {
    await addMember('member@campo.es', fieldCoop, 'Socio');
    const { accessToken } = await loginAs('member@campo.es');

    const response = await request(app)
      .get(`/cooperatives/${fieldCoop}/me/permissions`)
      .set(bearer(accessToken));

    expect(response.status).toBe(200);
    const body = myPermissionsResponseSchema.parse(response.body);
    expect(body).toMatchObject({ cooperativeId: fieldCoop, profileName: 'Socio', isPartner: true });
    expect(body.permissions).toContainEqual({
      module: 'member-area',
      level: 'read',
      scope: 'own',
    });
    expect(body.permissions.map((p) => p.module)).not.toContain('invoicing');
  });
});

describe('deny by default (US-ACC-07)', () => {
  it('Given a request without a valid session, when it reaches a protected endpoint, then it gets 401', async () => {
    for (const headers of [{}, bearer('not-a-jwt'), { Authorization: 'Basic abc' }]) {
      const response = await request(app)
        .get(`/cooperatives/${fieldCoop}/me/permissions`)
        .set(headers);
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('unauthenticated');
    }
    expect((await request(app).get('/me')).status).toBe(401);
  });

  it('Given a user without a membership in a cooperative, when they request one of its resources, then they get 404', async () => {
    const { accessToken } = await loginAs('admin@campo.es');

    for (const path of [
      `/cooperatives/${seaCoop}/me/permissions`,
      `/cooperatives/${seaCoop}/invoices`,
    ]) {
      const response = await request(app).get(path).set(bearer(accessToken));
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('not_found');
    }
  });

  it('a nonexistent cooperative or a malformed id answer the same as those of another cooperative', async () => {
    const { accessToken } = await loginAs('admin@campo.es');

    for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const response = await request(app)
        .get(`/cooperatives/${id}/me/permissions`)
        .set(bearer(accessToken));
      expect(response.status).toBe(404);
    }
  });

  it('Given a member without access to a module, when they call its API, then they get 403', async () => {
    await addMember('member@campo.es', fieldCoop, 'Socio');
    const { accessToken } = await loginAs('member@campo.es');

    const response = await request(app)
      .get(`/cooperatives/${fieldCoop}/invoices`)
      .set(bearer(accessToken));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('forbidden');
  });

  it('with permission, the use case receives the context and the scope', async () => {
    const { accessToken } = await loginAs('admin@campo.es');

    const response = await request(app)
      .get(`/cooperatives/${fieldCoop}/invoices`)
      .set(bearer(accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ cooperativeId: fieldCoop, scope: 'all' });
  });

  it('a suspension takes effect on the next request (BR-ACC-09)', async () => {
    const membership = await addMember('manager@campo.es', fieldCoop, 'Gestor');
    const { accessToken } = await loginAs('manager@campo.es');
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: 'suspended' },
    });

    const response = await request(app)
      .get(`/cooperatives/${fieldCoop}/invoices`)
      .set(bearer(accessToken));

    expect(response.status).toBe(404);
  });

  it('a profile change takes effect on the next request, without logging out (US-ACC-09)', async () => {
    const membership = await addMember('manager@campo.es', fieldCoop, 'Gestor');
    const { accessToken } = await loginAs('manager@campo.es');
    const path = `/cooperatives/${fieldCoop}/invoices`;
    expect((await request(app).get(path).set(bearer(accessToken))).status).toBe(200);

    const memberProfile = await prisma.profile.findFirstOrThrow({
      where: { cooperativeId: fieldCoop, name: 'Socio' },
    });
    await prisma.membership.update({
      where: { id: membership.id },
      data: { profileId: memberProfile.id },
    });

    expect((await request(app).get(path).set(bearer(accessToken))).status).toBe(403);
  });

  it('after logging out, the access token stops being valid immediately', async () => {
    const { accessToken, refreshToken } = await loginAs('admin@campo.es');
    await request(app).post('/auth/logout').send({ refreshToken });

    const response = await request(app).get('/me').set(bearer(accessToken));

    expect(response.status).toBe(401);
  });
});

describe('rate limiting (NFR-ACC-09)', () => {
  it('limits login per email even if the IP changes', async () => {
    ({ app } = buildApp({ windowMs: 60_000, perIp: 100, perEmail: 2 }));
    const attempt = (ip: string) =>
      request(app)
        .post('/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'Admin@Campo.es', password: PASSWORD });

    expect((await attempt('10.0.0.1')).status).toBe(200);
    expect((await attempt('10.0.0.2')).status).toBe(200);
    const limited = await attempt('10.0.0.3');

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'too_many_requests' });
  });

  it('limits all authentication requests per IP', async () => {
    ({ app } = buildApp({ windowMs: 60_000, perIp: 2, perEmail: 100 }));

    await request(app).post('/auth/refresh').send({ refreshToken: 'x' });
    await request(app).post('/auth/logout').send({ refreshToken: 'x' });
    const limited = await request(app).post('/auth/login').send({ email: 'a@b.es', password: 'x' });

    expect(limited.status).toBe(429);
  });
});
