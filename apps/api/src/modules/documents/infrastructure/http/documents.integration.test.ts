import {
  authTokensSchema,
  documentDetailSchema,
  documentSummarySchema,
  listDocumentsResponseSchema,
  listDocumentVersionsResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { type AppEvent, createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InProcessEventBus } from '../../../../shared/events';
import { S3FileStorage, s3SettingsFromEnv } from '../../../../shared/files/s3-file-storage';
import { createAccessModule } from '../../../access';

const PASSWORD = 'una-clave-larga';
const env = loadEnv(process.env);
const prisma = createTestPrisma();
const files = new S3FileStorage(s3SettingsFromEnv(env));
const events: AppEvent[] = [];
const bus = new InProcessEventBus<AppEvent>({ onHandlerError: () => {} });
bus.subscribe('DocumentoPublicado', (event) => void events.push(event));
bus.subscribe('DocumentoRetirado', (event) => void events.push(event));
const invitationSender = { send: async () => {} };
const app = createApi({
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender,
  files,
  events: bus,
  authRateLimits: false,
});

let campo: string;
let admin: string;
let socio: string;

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
  campo = (
    await access.provisionCooperative({
      name: 'Campo',
      cif: 'F12345674',
      admin: { email: 'admin@campo.test', name: 'Ana', password: PASSWORD },
    })
  ).cooperativeId;
  const { passwordHash } = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@campo.test' },
  });
  const profile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: campo, name: 'Socio' },
  });
  const user = await prisma.user.create({
    data: { email: 'socio@campo.test', name: 'Javier', passwordHash },
  });
  await prisma.membership.create({
    data: { userId: user.id, cooperativeId: campo, profileId: profile.id, status: 'activa' },
  });
  [admin, socio] = await Promise.all([login('admin@campo.test'), login('socio@campo.test')]);
});
afterAll(() => prisma.$disconnect());

const base = () => `/cooperativas/${campo}/documentos`;

async function upload(title: string, category: string, documentDate: string, content = pdf(title)) {
  return request(app)
    .post(base())
    .set(as(admin))
    .field('title', title)
    .field('category', category)
    .field('documentDate', documentDate)
    .attach('fichero', content, `${title}.pdf`);
}

describe('documentos por HTTP (HU-DOC-01..05)', () => {
  it('subir → listar y filtrar → abrir y descargar → nueva versión → historial → retirar', async () => {
    const created = await upload('Estatutos sociales', 'estatutos', '2024-05-10');
    expect(created.status).toBe(201);
    const document = documentSummarySchema.parse(created.body);
    expect(document).toMatchObject({ status: 'publicado', indexingStatus: 'pendiente' });
    await upload('Acta de marzo', 'actas', '2026-03-31');

    const all = listDocumentsResponseSchema.parse(
      (await request(app).get(base()).set(as(socio))).body,
    );
    expect(all.items.map((d) => d.title)).toEqual(['Acta de marzo', 'Estatutos sociales']);
    expect(all.items[0]?.indexingStatus).toBeNull();
    const actas = listDocumentsResponseSchema.parse(
      (await request(app).get(base()).query({ categoria: 'actas' }).set(as(socio))).body,
    );
    expect(actas.items.map((d) => d.title)).toEqual(['Acta de marzo']);
    const search = listDocumentsResponseSchema.parse(
      (await request(app).get(base()).query({ q: 'ESTATUTOS' }).set(as(socio))).body,
    );
    expect(search.items.map((d) => d.title)).toEqual(['Estatutos sociales']);

    const detail = documentDetailSchema.parse(
      (await request(app).get(`${base()}/${document.id}`).set(as(socio))).body,
    );
    const download = await fetch(detail.url);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf('Estatutos sociales'));

    const versioned = await request(app)
      .post(`${base()}/${document.id}/versiones`)
      .set(as(admin))
      .attach('fichero', pdf('Estatutos 2026'), 'Estatutos 2026.pdf');
    expect(versioned.status).toBe(201);
    const current = documentDetailSchema.parse(
      (await request(app).get(`${base()}/${document.id}`).set(as(socio))).body,
    );
    expect(Buffer.from(await (await fetch(current.url)).arrayBuffer())).toEqual(
      pdf('Estatutos 2026'),
    );

    const history = listDocumentVersionsResponseSchema.parse(
      (await request(app).get(`${base()}/${document.id}/versiones`).set(as(admin))).body,
    );
    expect(history.versions.map((v) => [v.fileName, v.isCurrent, v.uploadedByName])).toEqual([
      ['Estatutos 2026.pdf', true, 'Ana'],
      ['Estatutos sociales.pdf', false, 'Ana'],
    ]);

    expect(
      (await request(app).post(`${base()}/${document.id}/retirar`).set(as(admin))).status,
    ).toBe(204);
    expect((await request(app).get(`${base()}/${document.id}`).set(as(socio))).status).toBe(404);

    expect(events.map((e) => e.type)).toEqual([
      'DocumentoPublicado',
      'DocumentoPublicado',
      'DocumentoPublicado',
      'DocumentoRetirado',
    ]);
  });

  it('dos versiones simultáneas dejan una sola vigente (RN-DOC-03)', async () => {
    const document = documentSummarySchema.parse(
      (await upload('Reglamento', 'reglamento', '2025-01-01')).body,
    );

    await Promise.all(
      ['a', 'b', 'c'].map((v) =>
        request(app)
          .post(`${base()}/${document.id}/versiones`)
          .set(as(admin))
          .attach('fichero', pdf(v), `${v}.pdf`),
      ),
    );

    expect(await prisma.documentVersion.count({ where: { documentId: document.id } })).toBe(4);
    expect(
      await prisma.documentVersion.count({ where: { documentId: document.id, isCurrent: true } }),
    ).toBe(1);
  });

  it('Dado un fichero que no es PDF o de más de 20 MB, entonces se rechaza indicando el motivo', async () => {
    const notPdf = await upload('Falso', 'otros', '2026-01-01', Buffer.from('<html>'));
    const big = await upload(
      'Grande',
      'otros',
      '2026-01-01',
      Buffer.concat([pdf('x'), Buffer.alloc(20 * 1024 * 1024)]),
    );

    expect(notPdf.status).toBe(400);
    expect(notPdf.body.details).toEqual({ reason: 'not_pdf' });
    expect(big.status).toBe(400);
    expect(big.body.details).toEqual({ reason: 'too_large' });
    expect(await prisma.document.count()).toBe(0);
  });

  it('campos inválidos responden 400', async () => {
    const response = await upload('Acta', 'facturas', '2026-02-30');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
  });

  it('con consulta, subir, versionar, ver el historial y retirar responden 403', async () => {
    const document = documentSummarySchema.parse(
      (await upload('Acta', 'actas', '2026-01-01')).body,
    );

    const responses = await Promise.all([
      request(app)
        .post(base())
        .set(as(socio))
        .field('title', 'x')
        .field('category', 'otros')
        .field('documentDate', '2026-01-01')
        .attach('fichero', pdf('x'), 'x.pdf'),
      request(app)
        .post(`${base()}/${document.id}/versiones`)
        .set(as(socio))
        .attach('fichero', pdf('x'), 'x.pdf'),
      request(app).get(`${base()}/${document.id}/versiones`).set(as(socio)),
      request(app).post(`${base()}/${document.id}/retirar`).set(as(socio)),
    ]);

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403]);
  });
});
