import {
  authTokensSchema,
  inviteMemberResponseSchema,
  listAuditResponseSchema,
  listMembersResponseSchema,
  listProfilesResponseSchema,
  memberSchema,
  myPermissionsResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { createApp } from '../../../../app';
import { loadEnv } from '../../../../config/env';
import { createAccessModule, type InvitationSender } from '../../index';

const prisma = createTestPrisma();
const sent: Parameters<InvitationSender['send']>[0][] = [];
const access = createAccessModule({
  prisma,
  jwtSecret: loadEnv(process.env).JWT_SECRET,
  authRateLimits: false,
  invitationSender: { send: async (invitation) => void sent.push(invitation) },
});
const app = createApp({ routers: [access.router], errorHandlers: [access.errorHandler] });

const PASSWORD = 'una-clave-larga';

let campo: string;
let mar: string;
let adminToken: string;

beforeEach(async () => {
  await resetDatabase(prisma);
  sent.length = 0;
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
  adminToken = await login('admin@campo.es');
});
afterAll(() => prisma.$disconnect());

async function login(email: string, password = PASSWORD) {
  const response = await request(app).post('/auth/login').send({ email, password });
  return authTokensSchema.parse(response.body).accessToken;
}

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

async function profileId(cooperativeId: string, name: string) {
  return (await prisma.profile.findFirstOrThrow({ where: { cooperativeId, name } })).id;
}

async function invite(email: string, profile = 'Socio', token = adminToken, coop = campo) {
  return request(app)
    .post(`/cooperativas/${coop}/miembros`)
    .set(as(token))
    .send({ email, name: 'Margaret', profileId: await profileId(coop, profile), isPartner: true });
}

/** Invites, accepts and logs in: returns the new member's id and access token. */
async function activeMember(email: string, profile = 'Socio') {
  const { membershipId } = inviteMemberResponseSchema.parse((await invite(email, profile)).body);
  const { token } = sent.at(-1)!;
  await request(app).post('/auth/invitations/accept').send({ token, password: PASSWORD });
  return { membershipId, token: await login(email) };
}

const permissionsOf = async (token: string) =>
  myPermissionsResponseSchema.parse(
    (await request(app).get(`/cooperativas/${campo}/me/permisos`).set(as(token))).body,
  );

describe('ciclo de vida de un miembro (HU-ACC-08, HU-ACC-09, HU-ACC-10)', () => {
  it('invitar → aceptar → cambiar perfil → suspender → reactivar → dar de baja', async () => {
    const invited = await invite('margaret@campo.es', 'Socio');
    expect(invited.status).toBe(201);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ email: 'margaret@campo.es', cooperativeId: campo });

    const { membershipId } = inviteMemberResponseSchema.parse(invited.body);
    await request(app)
      .post('/auth/invitations/accept')
      .send({ token: sent[0]!.token, password: PASSWORD });
    const memberToken = await login('margaret@campo.es');
    expect((await permissionsOf(memberToken)).profileName).toBe('Socio');

    const changed = await request(app)
      .patch(`/cooperativas/${campo}/miembros/${membershipId}`)
      .set(as(adminToken))
      .send({ profileId: await profileId(campo, 'Gestor') });
    expect(changed.status).toBe(200);
    expect(memberSchema.parse(changed.body).profileName).toBe('Gestor');
    // Mismo token: el cambio se aplica en la siguiente petición.
    expect((await permissionsOf(memberToken)).profileName).toBe('Gestor');

    const suspended = await request(app)
      .patch(`/cooperativas/${campo}/miembros/${membershipId}`)
      .set(as(adminToken))
      .send({ status: 'suspendida' });
    expect(memberSchema.parse(suspended.body).status).toBe('suspendida');
    expect(
      (await request(app).get(`/cooperativas/${campo}/me/permisos`).set(as(memberToken))).status,
    ).toBe(404);

    await request(app)
      .patch(`/cooperativas/${campo}/miembros/${membershipId}`)
      .set(as(adminToken))
      .send({ status: 'activa' });
    expect((await permissionsOf(memberToken)).profileName).toBe('Gestor');

    const removed = await request(app)
      .post(`/cooperativas/${campo}/miembros/${membershipId}/baja`)
      .set(as(adminToken));
    expect(memberSchema.parse(removed.body).status).toBe('baja');

    const list = listMembersResponseSchema.parse(
      (await request(app).get(`/cooperativas/${campo}/miembros`).set(as(adminToken))).body,
    );
    expect(list.members.map((m) => m.email)).toEqual(['admin@campo.es']);

    const audit = listAuditResponseSchema.parse(
      (await request(app).get(`/cooperativas/${campo}/auditoria`).set(as(adminToken))).body,
    );
    expect(audit.events.map((e) => e.action)).toEqual([
      'member.removed',
      'member.reactivated',
      'member.suspended',
      'member.profile_changed',
      'member.invited',
    ]);
    expect(audit.events[3]?.detail).toEqual({
      before: { profile: 'Socio' },
      after: { profile: 'Gestor' },
    });
  });

  it('dar de baja en una cooperativa conserva el acceso a las demás', async () => {
    // Grace (admin del Mar) es también socia del Campo.
    const { membershipId } = inviteMemberResponseSchema.parse((await invite('admin@mar.es')).body);
    await request(app).post('/auth/invitations/accept').send({ token: sent[0]!.token });
    await request(app)
      .post(`/cooperativas/${campo}/miembros/${membershipId}/baja`)
      .set(as(adminToken));

    const grace = await login('admin@mar.es');
    const response = await request(app).get(`/cooperativas/${mar}/me/permisos`).set(as(grace));

    expect(response.status).toBe(200);
  });

  it('se puede volver a invitar a quien se dio de baja: crea una membresía nueva', async () => {
    const first = await activeMember('margaret@campo.es');
    await request(app)
      .post(`/cooperativas/${campo}/miembros/${first.membershipId}/baja`)
      .set(as(adminToken));

    const again = await invite('margaret@campo.es');

    expect(again.status).toBe(201);
    expect(inviteMemberResponseSchema.parse(again.body).membershipId).not.toBe(first.membershipId);
  });

  it('reenviar la invitación invalida el enlace anterior', async () => {
    const { membershipId } = inviteMemberResponseSchema.parse(
      (await invite('margaret@campo.es')).body,
    );
    const resent = await request(app)
      .post(`/cooperativas/${campo}/miembros/${membershipId}/invitacion`)
      .set(as(adminToken));
    expect(resent.status).toBe(204);
    const [first, second] = sent;

    const old = await request(app)
      .post('/auth/invitations/accept')
      .send({ token: first!.token, password: PASSWORD });
    const current = await request(app)
      .post('/auth/invitations/accept')
      .send({ token: second!.token, password: PASSWORD });

    expect(old.status).toBe(410);
    expect(current.status).toBe(200);
  });
});

describe('reglas y errores', () => {
  it('Dado un email que ya es miembro, cuando lo invito, entonces 409 y no se duplica', async () => {
    await invite('margaret@campo.es');

    const again = await invite('Margaret@Campo.es');

    expect(again.status).toBe(409);
    expect(again.body.error).toBe('member_already_exists');
    expect(await prisma.membership.count({ where: { cooperativeId: campo } })).toBe(2);
  });

  it('un administrador no puede modificarse a sí mismo (RN-ACC-08)', async () => {
    const own = await prisma.membership.findFirstOrThrow({
      where: { cooperativeId: campo, user: { email: 'admin@campo.es' } },
    });

    const response = await request(app)
      .patch(`/cooperativas/${campo}/miembros/${own.id}`)
      .set(as(adminToken))
      .send({ status: 'suspendida' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('self_modification');
  });

  it('un perfil de otra cooperativa no se puede asignar', async () => {
    const response = await request(app)
      .post(`/cooperativas/${campo}/miembros`)
      .set(as(adminToken))
      .send({
        email: 'x@campo.es',
        name: 'X',
        profileId: await profileId(mar, 'Socio'),
        isPartner: false,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('profile_not_found');
  });

  it('un cuerpo inválido responde 400', async () => {
    const response = await request(app)
      .patch(`/cooperativas/${campo}/miembros/00000000-0000-4000-8000-000000000000`)
      .set(as(adminToken))
      .send({ status: 'baja' });

    expect(response.status).toBe(400);
  });

  it('sin «Usuarios y perfiles · gestión» todas las rutas responden 403', async () => {
    const gestor = await activeMember('gestor@campo.es', 'Gestor');
    const paths = [
      ['get', `/cooperativas/${campo}/miembros`],
      ['get', `/cooperativas/${campo}/perfiles`],
      ['get', `/cooperativas/${campo}/auditoria`],
      ['post', `/cooperativas/${campo}/miembros`],
      ['patch', `/cooperativas/${campo}/miembros/${gestor.membershipId}`],
      ['post', `/cooperativas/${campo}/miembros/${gestor.membershipId}/baja`],
      ['post', `/cooperativas/${campo}/miembros/${gestor.membershipId}/invitacion`],
    ] as const;

    for (const [method, path] of paths) {
      const response = await request(app)[method](path).set(as(gestor.token)).send({});
      expect(response.status, `${method} ${path}`).toBe(403);
    }
  });

  it('dos administradores que se quitan el perfil a la vez no dejan la cooperativa sin ninguno (RN-ACC-07)', async () => {
    const other = await activeMember('otro@campo.es', 'Administrador');
    const own = await prisma.membership.findFirstOrThrow({
      where: { cooperativeId: campo, user: { email: 'admin@campo.es' } },
    });
    const socio = await profileId(campo, 'Socio');

    const responses = await Promise.all([
      request(app)
        .patch(`/cooperativas/${campo}/miembros/${other.membershipId}`)
        .set(as(adminToken))
        .send({ profileId: socio }),
      request(app)
        .patch(`/cooperativas/${campo}/miembros/${own.id}`)
        .set(as(other.token))
        .send({ profileId: socio }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const admins = await prisma.membership.count({
      where: {
        cooperativeId: campo,
        status: 'activa',
        profile: { permissions: { some: { module: 'usuarios', level: 'gestion' } } },
      },
    });
    expect(admins).toBe(1);
  });
});

describe('aislamiento entre cooperativas (ADR-003)', () => {
  it('el administrador de otra cooperativa recibe 404 en todas las rutas', async () => {
    const member = await activeMember('margaret@campo.es');
    const grace = await login('admin@mar.es');

    const responses = await Promise.all([
      request(app).get(`/cooperativas/${campo}/miembros`).set(as(grace)),
      request(app)
        .patch(`/cooperativas/${campo}/miembros/${member.membershipId}`)
        .set(as(grace))
        .send({ status: 'suspendida' }),
      request(app).get(`/cooperativas/${campo}/auditoria`).set(as(grace)),
    ]);

    expect(responses.map((r) => r.status)).toEqual([404, 404, 404]);
  });

  it('un miembro de otra cooperativa no se encuentra desde la propia', async () => {
    const member = await activeMember('margaret@campo.es');
    const grace = await login('admin@mar.es');

    const response = await request(app)
      .patch(`/cooperativas/${mar}/miembros/${member.membershipId}`)
      .set(as(grace))
      .send({ status: 'suspendida' });

    expect(response.status).toBe(404);
    expect(
      (await prisma.membership.findUniqueOrThrow({ where: { id: member.membershipId } })).status,
    ).toBe('activa');
  });

  it('la auditoría y los perfiles solo muestran los de la propia cooperativa', async () => {
    await invite('margaret@campo.es');
    const grace = await login('admin@mar.es');

    const audit = listAuditResponseSchema.parse(
      (await request(app).get(`/cooperativas/${mar}/auditoria`).set(as(grace))).body,
    );
    const profiles = listProfilesResponseSchema.parse(
      (await request(app).get(`/cooperativas/${mar}/perfiles`).set(as(grace))).body,
    );

    expect(audit.events).toEqual([]);
    expect(profiles.profiles).toHaveLength(4);
    for (const profile of profiles.profiles) {
      expect(
        (await prisma.profile.findUniqueOrThrow({ where: { id: profile.id } })).cooperativeId,
      ).toBe(mar);
    }
  });
});
