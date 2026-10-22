import {
  announcementDetailSchema,
  announcementSchema,
  authTokensSchema,
  listAnnouncementsResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { type AppEvent, createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InProcessEventBus } from '../../../../shared/events';
import { S3FileStorage, s3SettingsFromEnv } from '../../../../shared/files/s3-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';

const PASSWORD = 'a-long-password';
const env = loadEnv(process.env);
const prisma = createTestPrisma();
const files = new S3FileStorage(s3SettingsFromEnv(env));
const events: AppEvent[] = [];
const bus = new InProcessEventBus<AppEvent>({ onHandlerError: () => {} });
bus.subscribe('AnnouncementPublished', (event) => void events.push(event));
const invitationSender = { send: async () => {} };
const { app } = createApi({
  embedder: new HashingEmbedder(),
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender,
  files,
  events: bus,
  authRateLimits: false,
});

let fieldCoop: string;
let admin: string;
let member: string;
let otherCoopAdmin: string;

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const pdf = Buffer.from('%PDF-1.4\nAgenda\n%%EOF');

async function login(email: string) {
  const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  return authTokensSchema.parse(response.body).accessToken;
}

beforeAll(() => files.ensureBucket());

beforeEach(async () => {
  await resetDatabase(prisma);
  events.length = 0;
  const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET, invitationSender });
  fieldCoop = (
    await access.provisionCooperative({
      name: 'Campo',
      cif: 'F12345674',
      admin: { email: 'admin@field.test', name: 'Ana', password: PASSWORD },
    })
  ).cooperativeId;
  await access.provisionCooperative({
    name: 'Mar',
    cif: 'F76543214',
    admin: { email: 'admin@sea.test', name: 'Rosa', password: PASSWORD },
  });
  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@field.test' },
  });
  const profile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: fieldCoop, name: 'Socio' },
  });
  const user = await prisma.user.create({
    data: { email: 'member@field.test', name: 'Javier', passwordHash },
  });
  await prisma.membership.create({
    data: { userId: user.id, cooperativeId: fieldCoop, profileId: profile.id, status: 'active' },
  });
  [admin, member, otherCoopAdmin] = await Promise.all([
    login('admin@field.test'),
    login('member@field.test'),
    login('admin@sea.test'),
  ]);
});
afterAll(() => prisma.$disconnect());

const base = () => `/cooperatives/${fieldCoop}/announcements`;

async function draft(title = 'General assembly') {
  const response = await request(app)
    .post(base())
    .set(as(admin))
    .send({ title, body: 'All members are convened.' });
  return announcementSchema.parse(response.body);
}

describe('announcements over HTTP (US-ANN-01..07)', () => {
  it('draft -> attachment -> publish -> read and download -> withdraw', async () => {
    const created = await draft();
    expect(created.status).toBe('draft');
    expect(
      listAnnouncementsResponseSchema.parse((await request(app).get(base()).set(as(member))).body)
        .items,
    ).toEqual([]);

    const attached = await request(app)
      .post(`${base()}/${created.id}/attachments`)
      .set(as(admin))
      .attach('file', pdf, 'Agenda - assembly.pdf');
    expect(attached.status).toBe(201);
    expect(attached.body.name).toBe('Agenda - assembly.pdf');

    const published = await request(app).post(`${base()}/${created.id}/publish`).set(as(admin));
    expect(published.status).toBe(200);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'AnnouncementPublished',
        payload: {
          cooperativeId: fieldCoop,
          announcementId: created.id,
          title: 'General assembly',
        },
      }),
    ]);

    const list = listAnnouncementsResponseSchema.parse(
      (await request(app).get(base()).set(as(member))).body,
    );
    expect(list.items).toEqual([
      expect.objectContaining({
        id: created.id,
        read: false,
        attachmentCount: 1,
        authorName: 'Ana',
      }),
    ]);

    const detail = announcementDetailSchema.parse(
      (await request(app).get(`${base()}/${created.id}`).set(as(member))).body,
    );
    expect(detail.readStats).toBeNull();
    const download = await fetch(detail.attachments[0]!.url);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf);

    const relisted = listAnnouncementsResponseSchema.parse(
      (await request(app).get(base()).set(as(member))).body,
    );
    expect(relisted.items[0]?.read).toBe(true);

    const stats = announcementDetailSchema.parse(
      (await request(app).get(`${base()}/${created.id}`).set(as(admin))).body,
    ).readStats;
    expect(stats).toEqual({ readCount: 2, activeMembers: 2 });

    await request(app).post(`${base()}/${created.id}/withdraw`).set(as(admin));
    expect((await request(app).get(`${base()}/${created.id}`).set(as(member))).status).toBe(404);
  });

  it('two simultaneous publishes emit a single AnnouncementPublished (BR-ANN-07)', async () => {
    const created = await draft();

    const responses = await Promise.all(
      [1, 2].map(() => request(app).post(`${base()}/${created.id}/publish`).set(as(admin))),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(events).toHaveLength(1);
  });

  it('a read is recorded only once (BR-ANN-06)', async () => {
    const created = await draft();
    await request(app).post(`${base()}/${created.id}/publish`).set(as(admin));

    await Promise.all(
      [1, 2, 3].map(() => request(app).get(`${base()}/${created.id}`).set(as(member))),
    );

    expect(await prisma.announcementRead.count()).toBe(1);
  });

  it('a malformed list offset answers 400 invalid_request, not 500 (US-ANN-02)', async () => {
    const response = await request(app).get(`${base()}?offset=abc`).set(as(member));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_request' });
  });

  it('publishing without a body reports what is missing', async () => {
    const created = announcementSchema.parse(
      (await request(app).post(base()).set(as(admin)).send({ title: 'Title only', body: '' })).body,
    );

    const response = await request(app).post(`${base()}/${created.id}/publish`).set(as(admin));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'invalid_announcement',
      details: { issues: ['body_missing'] },
    });
  });

  it('a file that is not a PDF is rejected by its content', async () => {
    const created = await draft();

    const response = await request(app)
      .post(`${base()}/${created.id}/attachments`)
      .set(as(admin))
      .attach('file', Buffer.from('<html>not a pdf</html>'), 'fake.pdf');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'attachment_rejected',
      details: { reason: 'not_pdf' },
    });
  });

  it('an attachment over 10 MB is cut off on upload', async () => {
    const created = await draft();
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024)]);

    const response = await request(app)
      .post(`${base()}/${created.id}/attachments`)
      .set(as(admin))
      .attach('file', big, 'big.pdf');

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual({ reason: 'too_large' });
    expect(await prisma.announcementAttachment.count()).toBe(0);
  });

  it('with read access, manage actions answer 403 (US-ACC-07)', async () => {
    const created = await draft();

    const responses = await Promise.all([
      request(app).post(base()).set(as(member)).send({ title: 'x', body: 'y' }),
      request(app).patch(`${base()}/${created.id}`).set(as(member)).send({ title: 'x' }),
      request(app).post(`${base()}/${created.id}/publish`).set(as(member)),
      request(app).post(`${base()}/${created.id}/withdraw`).set(as(member)),
      request(app)
        .post(`${base()}/${created.id}/attachments`)
        .set(as(member))
        .attach('file', pdf, 'a.pdf'),
    ]);

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
  });

  it('an announcement of another cooperative answers 404 (ADR-003)', async () => {
    const created = await draft();
    await request(app).post(`${base()}/${created.id}/publish`).set(as(admin));

    const response = await request(app).get(`${base()}/${created.id}`).set(as(otherCoopAdmin));

    expect(response.status).toBe(404);
  });
});
