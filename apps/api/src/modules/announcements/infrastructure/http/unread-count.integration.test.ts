import { announcementSchema, announcementsUnreadSchema } from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { memberToken, TEST_PASSWORD } from '../../../../../test/members';
import { createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';

/** US-ANN-08: the unread count of the caller, for the badge of the home. */

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
let member: string;
let other: string;
let seaAdmin: string;

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const url = (cooperativeId = farm) => `/cooperatives/${cooperativeId}/announcements/unread-count`;
const unread = async (token: string, cooperativeId = farm) =>
  announcementsUnreadSchema.parse((await request(app).get(url(cooperativeId)).set(as(token))).body)
    .unread;

async function publish(title: string, token = admin, cooperativeId = farm) {
  const base = `/cooperatives/${cooperativeId}/announcements`;
  const created = announcementSchema.parse(
    (await request(app).post(base).set(as(token)).send({ title, body: 'Text' })).body,
  );
  await request(app).post(`${base}/${created.id}/publish`).set(as(token)).expect(200);
  return created.id;
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
  const login = (email: string) =>
    request(app)
      .post('/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .then((response) => response.body.accessToken as string);
  admin = await login('admin@farm.test');
  seaAdmin = await login('admin@sea.test');
  const base = { prisma, app, passwordOf: 'admin@farm.test', cooperativeId: farm };
  member = await memberToken(base, {
    ...base,
    email: 'member@farm.test',
    profileName: 'Socio',
    isPartner: true,
  });
  other = await memberToken(base, {
    ...base,
    email: 'other@farm.test',
    profileName: 'Socio',
    isPartner: true,
  });
});
afterAll(() => prisma.$disconnect());

describe('GET /announcements/unread-count (US-ANN-08)', () => {
  it('counts the published announcements the caller has not opened, per member', async () => {
    const first = await publish('One');
    await publish('Two');
    expect(await unread(member)).toBe(2);
    expect(await unread(other)).toBe(2);

    await request(app).get(`/cooperatives/${farm}/announcements/${first}`).set(as(member));

    expect(await unread(member)).toBe(1);
    expect(await unread(other)).toBe(2);
    // Opening it again changes nothing.
    await request(app).get(`/cooperatives/${farm}/announcements/${first}`).set(as(member));
    expect(await unread(member)).toBe(1);
  });

  it('drafts and withdrawn announcements do not count, not even for a manager', async () => {
    const base = `/cooperatives/${farm}/announcements`;
    await request(app).post(base).set(as(admin)).send({ title: 'Draft', body: 'Text' });
    const withdrawn = await publish('Gone');
    await request(app).post(`${base}/${withdrawn}/withdraw`).set(as(admin)).expect(200);
    await publish('Live');
    expect(await unread(member)).toBe(1);
    expect(await unread(admin)).toBe(1);
  });

  it('only counts its own cooperative', async () => {
    await publish('Sea news', seaAdmin, sea);
    expect(await unread(member)).toBe(0);
    expect(await unread(seaAdmin, sea)).toBe(1);
  });

  it('needs announcements access: a profile without it gets 403', async () => {
    await prisma.profile.create({ data: { cooperativeId: farm, name: 'Sin acceso' } });
    const none = await memberToken(
      { prisma, app },
      {
        passwordOf: 'admin@farm.test',
        cooperativeId: farm,
        email: 'none@farm.test',
        profileName: 'Sin acceso',
        isPartner: false,
      },
    );
    expect((await request(app).get(url()).set(as(none))).status).toBe(403);
  });

  it('answers 401 without a session and 404 to another cooperative', async () => {
    expect((await request(app).get(url())).status).toBe(401);
    expect((await request(app).get(url(farm)).set(as(seaAdmin))).status).toBe(404);
  });
});
