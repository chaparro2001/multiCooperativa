import {
  acceptInvitationResponseSchema,
  apiErrorSchema,
  authTokensSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { createApp } from '../../../../app';
import { loadEnv } from '../../../../config/env';
import { createAccessModule } from '../../index';
import { CryptoSecretTokens } from '../crypto-secret-tokens';

const prisma = createTestPrisma();
const access = createAccessModule({ prisma, jwtSecret: loadEnv(process.env).JWT_SECRET });
const app = createApp([access.router]);
const secrets = new CryptoSecretTokens();

const ADMIN = { email: 'admin@campo.es', password: 'clave-del-admin' };

let cooperativeId: string;

beforeEach(async () => {
  await resetDatabase(prisma);
  ({ cooperativeId } = await access.provisionCooperative({
    name: 'Cooperativa del Campo',
    cif: 'F12345678',
    admin: { email: ADMIN.email, name: 'Ada', password: ADMIN.password },
  }));
});
afterAll(() => prisma.$disconnect());

/** Stands in for the "invite member" endpoint, which is a later task. */
async function invite(email: string, existingUserId?: string) {
  const token = secrets.generate();
  const profile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId, name: 'Socio' },
  });
  const userId =
    existingUserId ?? (await prisma.user.create({ data: { email, name: 'Grace' } })).id;
  await prisma.membership.create({
    data: {
      userId,
      cooperativeId,
      profileId: profile.id,
      isPartner: true,
      invitation: {
        create: {
          tokenHash: secrets.hash(token),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
    },
  });
  return token;
}

const loginAs = (email: string, password: string) =>
  request(app).post('/auth/login').send({ email, password });

describe('flujo de autenticación (HU-ACC-01, HU-ACC-02, HU-ACC-03)', () => {
  it('invitación → activación → inicio de sesión → renovación → cierre', async () => {
    const token = await invite('grace@campo.es');

    const accepted = await request(app)
      .post('/auth/invitations/accept')
      .send({ token, password: 'clave-de-grace' });
    expect(accepted.status).toBe(200);
    const { tokens } = acceptInvitationResponseSchema.parse(accepted.body);
    expect(tokens).not.toBeNull();
    expect(
      await prisma.membership.findFirstOrThrow({ where: { user: { email: 'grace@campo.es' } } }),
    ).toMatchObject({ status: 'activa' });

    const loggedIn = await loginAs('Grace@Campo.es', 'clave-de-grace');
    expect(loggedIn.status).toBe(200);
    const session = authTokensSchema.parse(loggedIn.body);
    expect(session.accessTokenExpiresIn).toBe(900);

    const renewed = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(renewed.status).toBe(200);
    const { refreshToken } = authTokensSchema.parse(renewed.body);
    expect(refreshToken).not.toBe(session.refreshToken);

    const loggedOut = await request(app).post('/auth/logout').send({ refreshToken });
    expect(loggedOut.status).toBe(204);

    const afterLogout = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('la base de datos guarda solo hashes, nunca los tokens', async () => {
    const { body } = await loginAs(ADMIN.email, ADMIN.password);
    const { refreshToken } = authTokensSchema.parse(body);

    const [stored] = await prisma.session.findMany();
    expect(stored!.refreshTokenHash).not.toContain(refreshToken.split('.')[1]);
  });

  it('Dado un token de refresco ya utilizado, cuando se reutiliza, entonces se revoca toda la sesión', async () => {
    const { body } = await loginAs(ADMIN.email, ADMIN.password);
    const first = authTokensSchema.parse(body);
    const second = authTokensSchema.parse(
      (await request(app).post('/auth/refresh').send({ refreshToken: first.refreshToken })).body,
    );

    const replay = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    expect(apiErrorSchema.parse(replay.body).error).toBe('invalid_refresh_token');

    const legit = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: second.refreshToken });
    expect(legit.status).toBe(401);
    expect((await prisma.session.findFirstOrThrow()).revokedAt).not.toBeNull();
  });

  it('dos renovaciones simultáneas con el mismo token: como mucho una gana', async () => {
    const { refreshToken } = authTokensSchema.parse(
      (await loginAs(ADMIN.email, ADMIN.password)).body,
    );

    const responses = await Promise.all(
      [1, 2].map(() => request(app).post('/auth/refresh').send({ refreshToken })),
    );

    expect(responses.filter((response) => response.status === 200).length).toBeLessThanOrEqual(1);
  });

  it('credenciales incorrectas y email inexistente responden igual (RNF-ACC-05)', async () => {
    const wrongPassword = await loginAs(ADMIN.email, 'clave-equivocada');
    const unknownEmail = await loginAs('nadie@campo.es', 'clave-equivocada');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  it('cinco fallos bloquean el acceso aunque la contraseña sea correcta (RN-ACC-11)', async () => {
    for (let i = 0; i < 5; i++) await loginAs(ADMIN.email, 'clave-equivocada');

    const locked = await loginAs(ADMIN.email, ADMIN.password);

    expect(locked.status).toBe(429);
    expect(locked.body.error).toBe('login_locked');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('sin membresía activa no hay sesión', async () => {
    await prisma.membership.updateMany({ data: { status: 'suspendida' } });

    const response = await loginAs(ADMIN.email, ADMIN.password);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('no_active_membership');
    expect(await prisma.session.count()).toBe(0);
  });

  it('una invitación usada no se puede volver a usar', async () => {
    const token = await invite('grace@campo.es');
    await request(app).post('/auth/invitations/accept').send({ token, password: 'clave-de-grace' });

    const again = await request(app)
      .post('/auth/invitations/accept')
      .send({ token, password: 'otra-clave-larga' });

    expect(again.status).toBe(410);
    expect(again.body.error).toBe('invitation_not_usable');
  });

  it('un usuario con cuenta acepta sin contraseña y no recibe sesión', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    // Ada ya tiene cuenta por la primera cooperativa; la invitan a una segunda.
    const second = await access.provisionCooperative({
      name: 'Cooperativa del Mar',
      cif: 'F87654321',
      admin: { email: 'otro-admin@mar.es', name: 'Otro', password: 'clave-del-otro' },
    });
    cooperativeId = second.cooperativeId;
    const token = await invite(ADMIN.email, admin.id);

    const response = await request(app).post('/auth/invitations/accept').send({ token });

    expect(response.status).toBe(200);
    expect(acceptInvitationResponseSchema.parse(response.body)).toEqual({
      cooperativeId: second.cooperativeId,
      tokens: null,
    });
    expect(await prisma.membership.count({ where: { userId: admin.id, status: 'activa' } })).toBe(
      2,
    );
  });

  it.each([
    ['/auth/login', { email: 'admin@campo.es' }],
    ['/auth/refresh', {}],
    ['/auth/invitations/accept', { password: 'x' }],
  ])('%s con un cuerpo inválido responde 400', async (path, body) => {
    const response = await request(app).post(path).send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
  });

  it('un JSON mal formado responde 400', async () => {
    const response = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
  });
});
