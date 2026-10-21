import {
  authTokensSchema,
  inviteMemberResponseSchema,
  listAuditResponseSchema,
  listMembersResponseSchema,
  listProfilesResponseSchema,
  memberSchema,
  myPermissionsResponseSchema,
  resendInvitationResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { createApp } from '../../../../app';
import { loadEnv } from '../../../../config/env';
import { createAccessModule, type InvitationSender, LinkInvitationSender } from '../../index';

const prisma = createTestPrisma();
const sent: Parameters<InvitationSender['send']>[0][] = [];
const access = createAccessModule({
  prisma,
  jwtSecret: loadEnv(process.env).JWT_SECRET,
  authRateLimits: false,
  invitationSender: { send: async (invitation) => void sent.push(invitation) },
});
const app = createApp({ routers: [access.router], errorHandlers: [access.errorHandler] });

const PASSWORD = 'a-long-password';

let fieldCoop: string;
let seaCoop: string;
let adminToken: string;

beforeEach(async () => {
  await resetDatabase(prisma);
  sent.length = 0;
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

async function invite(email: string, profile = 'Socio', token = adminToken, coop = fieldCoop) {
  return request(app)
    .post(`/cooperatives/${coop}/members`)
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
    (await request(app).get(`/cooperatives/${fieldCoop}/me/permissions`).set(as(token))).body,
  );

describe('member lifecycle (US-ACC-08, US-ACC-09, US-ACC-10)', () => {
  it('invite → accept → change profile → suspend → reactivate → remove', async () => {
    const invited = await invite('margaret@campo.es', 'Socio');
    expect(invited.status).toBe(201);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ email: 'margaret@campo.es', cooperativeId: fieldCoop });

    const { membershipId } = inviteMemberResponseSchema.parse(invited.body);
    await request(app)
      .post('/auth/invitations/accept')
      .send({ token: sent[0]!.token, password: PASSWORD });
    const memberToken = await login('margaret@campo.es');
    expect((await permissionsOf(memberToken)).profileName).toBe('Socio');

    const changed = await request(app)
      .patch(`/cooperatives/${fieldCoop}/members/${membershipId}`)
      .set(as(adminToken))
      .send({ profileId: await profileId(fieldCoop, 'Gestor') });
    expect(changed.status).toBe(200);
    expect(memberSchema.parse(changed.body).profileName).toBe('Gestor');
    // Same token: the change applies on the next request.
    expect((await permissionsOf(memberToken)).profileName).toBe('Gestor');

    const suspended = await request(app)
      .patch(`/cooperatives/${fieldCoop}/members/${membershipId}`)
      .set(as(adminToken))
      .send({ status: 'suspended' });
    expect(memberSchema.parse(suspended.body).status).toBe('suspended');
    expect(
      (await request(app).get(`/cooperatives/${fieldCoop}/me/permissions`).set(as(memberToken)))
        .status,
    ).toBe(404);

    await request(app)
      .patch(`/cooperatives/${fieldCoop}/members/${membershipId}`)
      .set(as(adminToken))
      .send({ status: 'active' });
    expect((await permissionsOf(memberToken)).profileName).toBe('Gestor');

    const removed = await request(app)
      .post(`/cooperatives/${fieldCoop}/members/${membershipId}/removal`)
      .set(as(adminToken));
    expect(memberSchema.parse(removed.body).status).toBe('removed');

    const list = listMembersResponseSchema.parse(
      (await request(app).get(`/cooperatives/${fieldCoop}/members`).set(as(adminToken))).body,
    );
    expect(list.members.map((m) => m.email)).toEqual(['admin@campo.es']);

    const audit = listAuditResponseSchema.parse(
      (await request(app).get(`/cooperatives/${fieldCoop}/audit`).set(as(adminToken))).body,
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

  it('removal in one cooperative keeps access to the others', async () => {
    // Grace (admin of Mar) is also a partner of Campo.
    const { membershipId } = inviteMemberResponseSchema.parse((await invite('admin@mar.es')).body);
    await request(app).post('/auth/invitations/accept').send({ token: sent[0]!.token });
    await request(app)
      .post(`/cooperatives/${fieldCoop}/members/${membershipId}/removal`)
      .set(as(adminToken));

    const grace = await login('admin@mar.es');
    const response = await request(app)
      .get(`/cooperatives/${seaCoop}/me/permissions`)
      .set(as(grace));

    expect(response.status).toBe(200);
  });

  it('someone who was removed can be invited again: a new membership is created', async () => {
    const first = await activeMember('margaret@campo.es');
    await request(app)
      .post(`/cooperatives/${fieldCoop}/members/${first.membershipId}/removal`)
      .set(as(adminToken));

    const again = await invite('margaret@campo.es');

    expect(again.status).toBe(201);
    expect(inviteMemberResponseSchema.parse(again.body).membershipId).not.toBe(first.membershipId);
  });

  it('resending the invitation invalidates the previous link', async () => {
    const { membershipId } = inviteMemberResponseSchema.parse(
      (await invite('margaret@campo.es')).body,
    );
    const resent = await request(app)
      .post(`/cooperatives/${fieldCoop}/members/${membershipId}/invitation`)
      .set(as(adminToken));
    expect(resent.status).toBe(200);
    expect(resendInvitationResponseSchema.parse(resent.body).invitationUrl).toBeUndefined();
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

describe('rules and errors', () => {
  it('Given an email that is already a member, when I invite it, then 409 and nothing is duplicated', async () => {
    await invite('margaret@campo.es');

    const again = await invite('Margaret@Campo.es');

    expect(again.status).toBe(409);
    expect(again.body.error).toBe('member_already_exists');
    expect(await prisma.membership.count({ where: { cooperativeId: fieldCoop } })).toBe(2);
  });

  it('an administrator cannot modify themselves (BR-ACC-08)', async () => {
    const own = await prisma.membership.findFirstOrThrow({
      where: { cooperativeId: fieldCoop, user: { email: 'admin@campo.es' } },
    });

    const response = await request(app)
      .patch(`/cooperatives/${fieldCoop}/members/${own.id}`)
      .set(as(adminToken))
      .send({ status: 'suspended' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('self_modification');
  });

  it('a profile of another cooperative cannot be assigned', async () => {
    const response = await request(app)
      .post(`/cooperatives/${fieldCoop}/members`)
      .set(as(adminToken))
      .send({
        email: 'x@campo.es',
        name: 'X',
        profileId: await profileId(seaCoop, 'Socio'),
        isPartner: false,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('profile_not_found');
  });

  it('an invalid body answers 400', async () => {
    const response = await request(app)
      .patch(`/cooperatives/${fieldCoop}/members/00000000-0000-4000-8000-000000000000`)
      .set(as(adminToken))
      .send({ status: 'removed' });

    expect(response.status).toBe(400);
  });

  it('without "Users and profiles · manage" all routes answer 403', async () => {
    const gestor = await activeMember('manager@campo.es', 'Gestor');
    const paths = [
      ['get', `/cooperatives/${fieldCoop}/members`],
      ['get', `/cooperatives/${fieldCoop}/profiles`],
      ['get', `/cooperatives/${fieldCoop}/audit`],
      ['post', `/cooperatives/${fieldCoop}/members`],
      ['patch', `/cooperatives/${fieldCoop}/members/${gestor.membershipId}`],
      ['post', `/cooperatives/${fieldCoop}/members/${gestor.membershipId}/removal`],
      ['post', `/cooperatives/${fieldCoop}/members/${gestor.membershipId}/invitation`],
    ] as const;

    for (const [method, path] of paths) {
      const response = await request(app)[method](path).set(as(gestor.token)).send({});
      expect(response.status, `${method} ${path}`).toBe(403);
    }
  });

  it('two administrators removing the profile of each other at the same time do not leave the cooperative without any (BR-ACC-07)', async () => {
    const other = await activeMember('other@campo.es', 'Administrador');
    const own = await prisma.membership.findFirstOrThrow({
      where: { cooperativeId: fieldCoop, user: { email: 'admin@campo.es' } },
    });
    const memberProfile = await profileId(fieldCoop, 'Socio');

    const responses = await Promise.all([
      request(app)
        .patch(`/cooperatives/${fieldCoop}/members/${other.membershipId}`)
        .set(as(adminToken))
        .send({ profileId: memberProfile }),
      request(app)
        .patch(`/cooperatives/${fieldCoop}/members/${own.id}`)
        .set(as(other.token))
        .send({ profileId: memberProfile }),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const admins = await prisma.membership.count({
      where: {
        cooperativeId: fieldCoop,
        status: 'active',
        profile: { permissions: { some: { module: 'users', level: 'manage' } } },
      },
    });
    expect(admins).toBe(1);
  });
});

describe('isolation between cooperatives (ADR-003)', () => {
  it('the administrator of another cooperative gets 404 on all routes', async () => {
    const member = await activeMember('margaret@campo.es');
    const grace = await login('admin@mar.es');

    const responses = await Promise.all([
      request(app).get(`/cooperatives/${fieldCoop}/members`).set(as(grace)),
      request(app)
        .patch(`/cooperatives/${fieldCoop}/members/${member.membershipId}`)
        .set(as(grace))
        .send({ status: 'suspended' }),
      request(app).get(`/cooperatives/${fieldCoop}/audit`).set(as(grace)),
    ]);

    expect(responses.map((r) => r.status)).toEqual([404, 404, 404]);
  });

  it('a member of another cooperative is not found from another cooperative', async () => {
    const member = await activeMember('margaret@campo.es');
    const grace = await login('admin@mar.es');

    const response = await request(app)
      .patch(`/cooperatives/${seaCoop}/members/${member.membershipId}`)
      .set(as(grace))
      .send({ status: 'suspended' });

    expect(response.status).toBe(404);
    expect(
      (await prisma.membership.findUniqueOrThrow({ where: { id: member.membershipId } })).status,
    ).toBe('active');
  });

  it('the audit log and the profiles show only those of the own cooperative', async () => {
    await invite('margaret@campo.es');
    const grace = await login('admin@mar.es');

    const audit = listAuditResponseSchema.parse(
      (await request(app).get(`/cooperatives/${seaCoop}/audit`).set(as(grace))).body,
    );
    const profiles = listProfilesResponseSchema.parse(
      (await request(app).get(`/cooperatives/${seaCoop}/profiles`).set(as(grace))).body,
    );

    expect(audit.events).toEqual([]);
    expect(profiles.profiles).toHaveLength(4);
    for (const profile of profiles.profiles) {
      expect(
        (await prisma.profile.findUniqueOrThrow({ where: { id: profile.id } })).cooperativeId,
      ).toBe(seaCoop);
    }
  });
});

describe('administrator-delivered links (US-ACC-08, ADR-016)', () => {
  const WEB_APP_URL = 'https://coop.example/multiCooperativa';
  const linkAccess = createAccessModule({
    prisma,
    jwtSecret: loadEnv(process.env).JWT_SECRET,
    authRateLimits: false,
    invitationSender: new LinkInvitationSender(WEB_APP_URL),
  });
  const linkApp = createApp({
    routers: [linkAccess.router],
    errorHandlers: [linkAccess.errorHandler],
  });
  const tokenOf = (url: string) => new URL(url).searchParams.get('token')!;

  async function inviteByLink(email: string, token = adminToken) {
    return request(linkApp)
      .post(`/cooperatives/${fieldCoop}/members`)
      .set(as(token))
      .send({
        email,
        name: 'Margaret',
        profileId: await profileId(fieldCoop, 'Socio'),
        isPartner: true,
      });
  }

  it('the invite response gives the administrator the web link and its expiry', async () => {
    const response = await inviteByLink('margaret@campo.es');

    expect(response.status).toBe(201);
    const body = inviteMemberResponseSchema.parse(response.body);
    expect(body.invitationUrl).toMatch(
      /^https:\/\/coop\.example\/multiCooperativa\/invitation\?token=[\w-]+$/,
    );
    const days = (Date.parse(body.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('the token in the link activates the account and it is single use (BR-ACC-10)', async () => {
    const body = inviteMemberResponseSchema.parse((await inviteByLink('margaret@campo.es')).body);
    const token = tokenOf(body.invitationUrl!);

    const first = await request(linkApp)
      .post('/auth/invitations/accept')
      .send({ token, password: PASSWORD });
    const second = await request(linkApp)
      .post('/auth/invitations/accept')
      .send({ token, password: PASSWORD });

    expect(first.status).toBe(200);
    expect(second.status).toBe(410);
    expect(await login('margaret@campo.es')).toBeTruthy();
  });

  it('resending returns a new link and the previous one stops working', async () => {
    const body = inviteMemberResponseSchema.parse((await inviteByLink('margaret@campo.es')).body);
    const resent = await request(linkApp)
      .post(`/cooperatives/${fieldCoop}/members/${body.membershipId}/invitation`)
      .set(as(adminToken));

    expect(resent.status).toBe(200);
    const issued = resendInvitationResponseSchema.parse(resent.body);
    expect(tokenOf(issued.invitationUrl!)).not.toBe(tokenOf(body.invitationUrl!));

    const old = await request(linkApp)
      .post('/auth/invitations/accept')
      .send({ token: tokenOf(body.invitationUrl!), password: PASSWORD });
    const current = await request(linkApp)
      .post('/auth/invitations/accept')
      .send({ token: tokenOf(issued.invitationUrl!), password: PASSWORD });
    expect(old.status).toBe(410);
    expect(current.status).toBe(200);
  });

  it('whoever cannot manage users gets 403 and no link', async () => {
    const { token: socioToken } = await activeMember('socio@campo.es');
    const { membershipId } = inviteMemberResponseSchema.parse(
      (await inviteByLink('margaret@campo.es')).body,
    );

    const invited = await inviteByLink('other@campo.es', socioToken);
    const resent = await request(linkApp)
      .post(`/cooperatives/${fieldCoop}/members/${membershipId}/invitation`)
      .set(as(socioToken));

    expect(invited.status).toBe(403);
    expect(resent.status).toBe(403);
    expect(JSON.stringify([invited.body, resent.body])).not.toContain('invitation?token');
  });

  it('the list of members never carries the link', async () => {
    await inviteByLink('margaret@campo.es');
    const list = await request(linkApp)
      .get(`/cooperatives/${fieldCoop}/members`)
      .set(as(adminToken));
    expect(JSON.stringify(list.body)).not.toContain('token');
  });
});
