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
  const access = createAccessModule({ prisma, jwtSecret, authRateLimits });

  // Stand-in for another module's router, wired the way real modules will be.
  const facturas = Router();
  facturas.get(
    '/cooperativas/:cooperativeId/facturas',
    access.requireCooperative,
    requirePermission('facturas', 'consulta'),
    (_req, res) => {
      const context = getCooperativeContext(res);
      const scope = requireAccess(context.permissions, 'facturas', 'consulta');
      res.json({ cooperativeId: context.cooperativeId, scope });
    },
  );

  const app = createApp({
    routers: [access.router, facturas],
    errorHandlers: [access.errorHandler],
    // As behind Railway's proxy: X-Forwarded-For decides the client IP.
    trustProxy: 1,
  });
  return { app, access };
}

let app: ReturnType<typeof buildApp>['app'];
let access: ReturnType<typeof buildApp>['access'];
let campo: string;
let mar: string;

const PASSWORD = 'una-clave-larga';

beforeEach(async () => {
  await resetDatabase(prisma);
  ({ app, access } = buildApp());
  campo = (
    await access.provisionCooperative({
      name: 'Cooperativa del Campo',
      cif: 'F12345678',
      admin: { email: 'admin@campo.es', name: 'Ada', password: PASSWORD },
    })
  ).cooperativeId;
  mar = (
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
      status: 'activa',
      isPartner: true,
    },
  });
}

async function loginAs(email: string) {
  const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  return authTokensSchema.parse(response.body);
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('GET /me (HU-ACC-05)', () => {
  it('devuelve el usuario y sus membresías activas', async () => {
    await addMember('admin@campo.es', mar, 'Socio');
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

  it('no incluye membresías suspendidas', async () => {
    const membership = await addMember('admin@campo.es', mar, 'Socio');
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: 'suspendida' },
    });
    const { accessToken } = await loginAs('admin@campo.es');

    const me = meResponseSchema.parse(
      (await request(app).get('/me').set(bearer(accessToken))).body,
    );

    expect(me.memberships.map((m) => m.cooperativeId)).toEqual([campo]);
  });
});

describe('GET /cooperativas/{id}/me/permisos (HU-ACC-06)', () => {
  it('devuelve el perfil, la condición de socio y los permisos efectivos', async () => {
    await addMember('socio@campo.es', campo, 'Socio');
    const { accessToken } = await loginAs('socio@campo.es');

    const response = await request(app)
      .get(`/cooperativas/${campo}/me/permisos`)
      .set(bearer(accessToken));

    expect(response.status).toBe(200);
    const body = myPermissionsResponseSchema.parse(response.body);
    expect(body).toMatchObject({ cooperativeId: campo, profileName: 'Socio', isPartner: true });
    expect(body.permissions).toContainEqual({
      module: 'area-socio',
      level: 'consulta',
      scope: 'propias',
    });
    expect(body.permissions.map((p) => p.module)).not.toContain('facturas');
  });
});

describe('denegar por defecto (HU-ACC-07)', () => {
  it('Dado una petición sin sesión válida, cuando llega a un endpoint protegido, entonces recibe 401', async () => {
    for (const headers of [{}, bearer('no-es-un-jwt'), { Authorization: 'Basic abc' }]) {
      const response = await request(app).get(`/cooperativas/${campo}/me/permisos`).set(headers);
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('unauthenticated');
    }
    expect((await request(app).get('/me')).status).toBe(401);
  });

  it('Dado un usuario sin membresía en una cooperativa, cuando pide un recurso de ella, entonces recibe 404', async () => {
    const { accessToken } = await loginAs('admin@campo.es');

    for (const path of [`/cooperativas/${mar}/me/permisos`, `/cooperativas/${mar}/facturas`]) {
      const response = await request(app).get(path).set(bearer(accessToken));
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('not_found');
    }
  });

  it('una cooperativa inexistente o un id mal formado responden igual que una ajena', async () => {
    const { accessToken } = await loginAs('admin@campo.es');

    for (const id of ['00000000-0000-4000-8000-000000000000', 'no-es-un-uuid']) {
      const response = await request(app)
        .get(`/cooperativas/${id}/me/permisos`)
        .set(bearer(accessToken));
      expect(response.status).toBe(404);
    }
  });

  it('Dado un miembro sin acceso a un módulo, cuando llama a su API, entonces recibe 403', async () => {
    await addMember('socio@campo.es', campo, 'Socio');
    const { accessToken } = await loginAs('socio@campo.es');

    const response = await request(app)
      .get(`/cooperativas/${campo}/facturas`)
      .set(bearer(accessToken));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('forbidden');
  });

  it('con permiso, el caso de uso recibe el contexto y el alcance', async () => {
    const { accessToken } = await loginAs('admin@campo.es');

    const response = await request(app)
      .get(`/cooperativas/${campo}/facturas`)
      .set(bearer(accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ cooperativeId: campo, scope: 'todas' });
  });

  it('una suspensión tiene efecto en la siguiente petición (RN-ACC-09)', async () => {
    const membership = await addMember('gestor@campo.es', campo, 'Gestor');
    const { accessToken } = await loginAs('gestor@campo.es');
    await prisma.membership.update({
      where: { id: membership.id },
      data: { status: 'suspendida' },
    });

    const response = await request(app)
      .get(`/cooperativas/${campo}/facturas`)
      .set(bearer(accessToken));

    expect(response.status).toBe(404);
  });

  it('un cambio de perfil tiene efecto en la siguiente petición, sin cerrar sesión (HU-ACC-09)', async () => {
    const membership = await addMember('gestor@campo.es', campo, 'Gestor');
    const { accessToken } = await loginAs('gestor@campo.es');
    const path = `/cooperativas/${campo}/facturas`;
    expect((await request(app).get(path).set(bearer(accessToken))).status).toBe(200);

    const socio = await prisma.profile.findFirstOrThrow({
      where: { cooperativeId: campo, name: 'Socio' },
    });
    await prisma.membership.update({ where: { id: membership.id }, data: { profileId: socio.id } });

    expect((await request(app).get(path).set(bearer(accessToken))).status).toBe(403);
  });

  it('tras cerrar sesión, el token de acceso deja de valer al momento', async () => {
    const { accessToken, refreshToken } = await loginAs('admin@campo.es');
    await request(app).post('/auth/logout').send({ refreshToken });

    const response = await request(app).get('/me').set(bearer(accessToken));

    expect(response.status).toBe(401);
  });
});

describe('límite de peticiones (RNF-ACC-09)', () => {
  it('limita el login por email aunque cambie la IP', async () => {
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

  it('limita todas las peticiones de autenticación por IP', async () => {
    ({ app } = buildApp({ windowMs: 60_000, perIp: 2, perEmail: 100 }));

    await request(app).post('/auth/refresh').send({ refreshToken: 'x' });
    await request(app).post('/auth/logout').send({ refreshToken: 'x' });
    const limited = await request(app).post('/auth/login').send({ email: 'a@b.es', password: 'x' });

    expect(limited.status).toBe(429);
  });
});
