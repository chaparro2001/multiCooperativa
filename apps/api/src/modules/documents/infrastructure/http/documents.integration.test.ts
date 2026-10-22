import {
  authTokensSchema,
  documentDetailSchema,
  documentSummarySchema,
  searchDocumentsResponseSchema,
  listDocumentsResponseSchema,
  listDocumentVersionsResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { buildPdf } from '../../../../../test/pdf';
import { type AppEvent, createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InProcessEventBus } from '../../../../shared/events';
import { S3FileStorage, s3SettingsFromEnv } from '../../../../shared/files/s3-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../index';

const PASSWORD = 'una-clave-larga';
const env = loadEnv(process.env);
const prisma = createTestPrisma();
const files = new S3FileStorage(s3SettingsFromEnv(env));
const events: AppEvent[] = [];
const bus = new InProcessEventBus<AppEvent>({ onHandlerError: () => {} });
bus.subscribe('DocumentPublished', (event) => void events.push(event));
bus.subscribe('DocumentWithdrawn', (event) => void events.push(event));
const invitationSender = { send: async () => {} };
const { app, indexing } = createApi({
  embedder: new HashingEmbedder(),
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender,
  files,
  events: bus,
  authRateLimits: false,
});

let coop: string;
let sea: string;
let admin: string;
let member: string;
let seaAdmin: string;

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);

async function login(email: string) {
  const response = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  return authTokensSchema.parse(response.body).accessToken;
}

beforeAll(() => files.ensureBucket());

beforeEach(async () => {
  await resetDatabase(prisma);
  events.length = 0;
  const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET, invitationSender });
  coop = (
    await access.provisionCooperative({
      name: 'Farm',
      cif: 'F12345674',
      admin: { email: 'admin@coop.test', name: 'Ana', password: PASSWORD },
    })
  ).cooperativeId;
  sea = (
    await access.provisionCooperative({
      name: 'Sea',
      cif: 'F76543214',
      admin: { email: 'admin@sea.test', name: 'Rosa', password: PASSWORD },
    })
  ).cooperativeId;
  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@coop.test' },
  });
  const profile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: coop, name: 'Socio' },
  });
  const user = await prisma.user.create({
    data: { email: 'member@coop.test', name: 'Javier', passwordHash },
  });
  await prisma.membership.create({
    data: { userId: user.id, cooperativeId: coop, profileId: profile.id, status: 'active' },
  });
  [admin, member, seaAdmin] = await Promise.all([
    login('admin@coop.test'),
    login('member@coop.test'),
    login('admin@sea.test'),
  ]);
});
afterAll(() => prisma.$disconnect());

const base = () => `/cooperatives/${coop}/documents`;

async function upload(
  title: string,
  category: string,
  documentDate: string,
  content: Uint8Array = pdf(title),
  token = admin,
  cooperativeId = coop,
) {
  return request(app)
    .post(`/cooperatives/${cooperativeId}/documents`)
    .set(as(token))
    .field('title', title)
    .field('category', category)
    .field('documentDate', documentDate)
    .attach('file', Buffer.from(content), `${title}.pdf`);
}

describe('documents over HTTP (US-DOC-01..05)', () => {
  it('upload → list and filter → open and download → new version → history → withdraw', async () => {
    const created = await upload('Corporate bylaws', 'bylaws', '2024-05-10');
    expect(created.status).toBe(201);
    const document = documentSummarySchema.parse(created.body);
    expect(document).toMatchObject({ status: 'published', indexingStatus: 'pending' });
    await upload('March minutes', 'minutes', '2026-03-31');

    const all = listDocumentsResponseSchema.parse(
      (await request(app).get(base()).set(as(member))).body,
    );
    expect(all.items.map((d) => d.title)).toEqual(['March minutes', 'Corporate bylaws']);
    expect(all.items[0]?.indexingStatus).toBeNull();
    const actas = listDocumentsResponseSchema.parse(
      (await request(app).get(base()).query({ category: 'minutes' }).set(as(member))).body,
    );
    expect(actas.items.map((d) => d.title)).toEqual(['March minutes']);
    const search = listDocumentsResponseSchema.parse(
      (await request(app).get(base()).query({ q: 'BYLAWS' }).set(as(member))).body,
    );
    expect(search.items.map((d) => d.title)).toEqual(['Corporate bylaws']);

    const detail = documentDetailSchema.parse(
      (await request(app).get(`${base()}/${document.id}`).set(as(member))).body,
    );
    const download = await fetch(detail.url);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf('Corporate bylaws'));

    const versioned = await request(app)
      .post(`${base()}/${document.id}/versions`)
      .set(as(admin))
      .attach('file', pdf('Bylaws 2026'), 'Bylaws 2026.pdf');
    expect(versioned.status).toBe(201);
    const current = documentDetailSchema.parse(
      (await request(app).get(`${base()}/${document.id}`).set(as(member))).body,
    );
    expect(Buffer.from(await (await fetch(current.url)).arrayBuffer())).toEqual(pdf('Bylaws 2026'));

    const history = listDocumentVersionsResponseSchema.parse(
      (await request(app).get(`${base()}/${document.id}/versions`).set(as(admin))).body,
    );
    expect(history.versions.map((v) => [v.fileName, v.isCurrent, v.uploadedByName])).toEqual([
      ['Bylaws 2026.pdf', true, 'Ana'],
      ['Corporate bylaws.pdf', false, 'Ana'],
    ]);

    expect(
      (await request(app).post(`${base()}/${document.id}/withdraw`).set(as(admin))).status,
    ).toBe(204);
    expect((await request(app).get(`${base()}/${document.id}`).set(as(member))).status).toBe(404);

    expect(events.map((e) => e.type)).toEqual([
      'DocumentPublished',
      'DocumentPublished',
      'DocumentPublished',
      'DocumentWithdrawn',
    ]);
  });

  it('two simultaneous versions leave a single current one (BR-DOC-03)', async () => {
    const document = documentSummarySchema.parse(
      (await upload('Reglamento', 'regulations', '2025-01-01')).body,
    );

    await Promise.all(
      ['a', 'b', 'c'].map((v) =>
        request(app)
          .post(`${base()}/${document.id}/versions`)
          .set(as(admin))
          .attach('file', pdf(v), `${v}.pdf`),
      ),
    );

    expect(await prisma.documentVersion.count({ where: { documentId: document.id } })).toBe(4);
    expect(
      await prisma.documentVersion.count({ where: { documentId: document.id, isCurrent: true } }),
    ).toBe(1);
  });

  it('Given a file that is not a PDF or is larger than 20 MB, then it is rejected stating the reason', async () => {
    const notPdf = await upload('Falso', 'other', '2026-01-01', Buffer.from('<html>'));
    const big = await upload(
      'Grande',
      'other',
      '2026-01-01',
      Buffer.concat([pdf('x'), Buffer.alloc(20 * 1024 * 1024)]),
    );

    expect(notPdf.status).toBe(400);
    expect(notPdf.body.details).toEqual({ reason: 'not_pdf' });
    expect(big.status).toBe(400);
    expect(big.body.details).toEqual({ reason: 'too_large' });
    expect(await prisma.document.count()).toBe(0);
  });

  it('invalid fields respond 400', async () => {
    const response = await upload('Acta', 'invoices', '2026-02-30');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
  });

  it('with read access, uploading, versioning, viewing the history and withdrawing respond 403', async () => {
    const document = documentSummarySchema.parse(
      (await upload('Acta', 'minutes', '2026-01-01')).body,
    );

    const responses = await Promise.all([
      request(app)
        .post(base())
        .set(as(member))
        .field('title', 'x')
        .field('category', 'other')
        .field('documentDate', '2026-01-01')
        .attach('file', pdf('x'), 'x.pdf'),
      request(app)
        .post(`${base()}/${document.id}/versions`)
        .set(as(member))
        .attach('file', pdf('x'), 'x.pdf'),
      request(app).get(`${base()}/${document.id}/versions`).set(as(member)),
      request(app).post(`${base()}/${document.id}/withdraw`).set(as(member)),
    ]);

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403]);
  });
});

describe('republishing a withdrawn document (US-DOC-08)', () => {
  it('republish: 403 with read access, 409 if published, 404 if unknown; 204 restores visibility and re-indexes (BR-DOC-08)', async () => {
    const document = documentSummarySchema.parse(
      (
        await upload(
          'Bylaws',
          'bylaws',
          '2026-01-01',
          await buildPdf([['The ordinary general assembly is held in June.']]),
        )
      ).body,
    );
    await indexing.idle();
    const republish = (token: string, id = document.id) =>
      request(app).post(`${base()}/${id}/republish`).set(as(token));

    expect((await republish(admin)).status).toBe(409);
    await request(app).post(`${base()}/${document.id}/withdraw`).set(as(admin));
    await indexing.idle();
    expect(await prisma.documentChunk.count()).toBe(0);
    const withdrawn = documentDetailSchema.parse(
      (await request(app).get(`${base()}/${document.id}`).set(as(admin))).body,
    );
    expect(withdrawn).toMatchObject({ status: 'withdrawn', indexingStatus: null });
    expect((await republish(member)).status).toBe(403);
    expect((await republish(admin, '00000000-0000-4000-8000-00000000dead')).status).toBe(404);
    expect((await request(app).get(`${base()}/${document.id}`).set(as(member))).status).toBe(404);

    expect((await republish(admin)).status).toBe(204);
    await indexing.idle();

    expect((await request(app).get(`${base()}/${document.id}`).set(as(member))).status).toBe(200);
    expect(await prisma.documentChunk.count()).toBeGreaterThan(0);
    const back = documentDetailSchema.parse(
      (await request(app).get(`${base()}/${document.id}`).set(as(admin))).body,
    );
    expect(back).toMatchObject({ status: 'published', indexingStatus: 'indexed' });
    expect(events.map((e) => e.type)).toEqual([
      'DocumentPublished',
      'DocumentWithdrawn',
      'DocumentPublished',
    ]);
  });
});

describe('indexing and search (requirements/03, section 4; US-DOC-06, US-DOC-07)', () => {
  const bylawsPdf = () =>
    buildPdf([
      ['Article 1. Name.', 'The cooperative is named San Isidro.'],
      ['Article 12. General assembly.', 'The ordinary general assembly is held in June.'],
    ]);

  const search = (q: string, token = member, cooperativeId = coop) =>
    request(app).get(`/cooperatives/${cooperativeId}/documents/search`).query({ q }).set(as(token));

  it('a real PDF is indexed per page with its cooperative and is found by content', async () => {
    const document = documentSummarySchema.parse(
      (await upload('Bylaws', 'bylaws', '2026-01-01', await bylawsPdf())).body,
    );
    await indexing.idle();

    const detail = documentDetailSchema.parse(
      (await request(app).get(`${base()}/${document.id}`).set(as(admin))).body,
    );
    expect(detail.indexingStatus).toBe('indexed');
    const chunks = await prisma.documentChunk.findMany({ orderBy: { position: 'asc' } });
    expect(chunks.map((c) => [c.cooperativeId, c.documentId, c.page])).toEqual([
      [coop, document.id, 1],
      [coop, document.id, 2],
    ]);

    const results = searchDocumentsResponseSchema.parse(
      (await search('general assembly june')).body,
    );
    expect(results.items[0]).toMatchObject({
      documentId: document.id,
      page: 2,
      title: 'Bylaws',
    });
    expect(results.items[0]?.excerpt).toContain('is held in June');
  });

  it('search never returns fragments of another cooperative, even if the text matches exactly (BR-AI-04)', async () => {
    await upload('Sea bylaws', 'bylaws', '2026-01-01', await bylawsPdf(), seaAdmin, sea);
    await indexing.idle();

    const results = searchDocumentsResponseSchema.parse(
      (await search('The ordinary general assembly is held in June.')).body,
    );

    expect(results.items).toEqual([]);
  });

  it('withdrawing removes the fragments; a new version replaces the previous ones (BR-DOC-05)', async () => {
    const document = documentSummarySchema.parse(
      (await upload('Bylaws', 'bylaws', '2026-01-01', await bylawsPdf())).body,
    );
    await indexing.idle();

    await request(app)
      .post(`${base()}/${document.id}/versions`)
      .set(as(admin))
      .attach('file', Buffer.from(await buildPdf([['New irrigation regulation.']])), 'v2.pdf');
    await indexing.idle();
    expect((await prisma.documentChunk.findMany()).map((c) => c.content)).toEqual([
      'New irrigation regulation.',
    ]);

    await request(app).post(`${base()}/${document.id}/withdraw`).set(as(admin));
    await indexing.idle();
    expect(await prisma.documentChunk.count()).toBe(0);
  });

  it('a PDF without text is marked not indexable with the reason, and can still be viewed', async () => {
    const document = documentSummarySchema.parse(
      (await upload('Escaneado', 'minutes', '2026-01-01', await buildPdf([[]]))).body,
    );
    await indexing.idle();

    const detail = documentDetailSchema.parse(
      (await request(app).get(`${base()}/${document.id}`).set(as(admin))).body,
    );
    expect(detail).toMatchObject({ indexingStatus: 'not_indexable' });
    expect(detail.indexingError).toMatch(/scanned/);
    expect((await request(app).get(`${base()}/${document.id}`).set(as(member))).status).toBe(200);
  });

  it('reindex responds 202 and indexes again', async () => {
    const document = documentSummarySchema.parse(
      (await upload('Bylaws', 'bylaws', '2026-01-01', await bylawsPdf())).body,
    );
    await indexing.idle();
    await prisma.documentChunk.deleteMany();

    const response = await request(app).post(`${base()}/${document.id}/reindex`).set(as(admin));
    await indexing.idle();

    expect(response.status).toBe(202);
    expect(await prisma.documentChunk.count()).toBe(2);
  });

  it('a query that is too short responds 400', async () => {
    expect((await search('ab')).status).toBe(400);
  });
});
