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

const PASSWORD = 'una-clave-larga';
const env = loadEnv(process.env);
const prisma = createTestPrisma();
const files = new S3FileStorage(s3SettingsFromEnv(env));
const events: AppEvent[] = [];
const bus = new InProcessEventBus<AppEvent>({ onHandlerError: () => {} });
bus.subscribe('ComunicadoPublicado', (event) => void events.push(event));
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
let otherCoopAdmin: string;

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const pdf = Buffer.from('%PDF-1.4\nOrden del día\n%%EOF');

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
  await access.provisionCooperative({
    name: 'Mar',
    cif: 'F76543214',
    admin: { email: 'admin@mar.test', name: 'Rosa', password: PASSWORD },
  });
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
  [admin, socio, otherCoopAdmin] = await Promise.all([
    login('admin@campo.test'),
    login('socio@campo.test'),
    login('admin@mar.test'),
  ]);
});
afterAll(() => prisma.$disconnect());

const base = () => `/cooperativas/${campo}/comunicados`;

async function draft(title = 'Asamblea general') {
  const response = await request(app)
    .post(base())
    .set(as(admin))
    .send({ title, body: 'Se convoca a todos los socios.' });
  return announcementSchema.parse(response.body);
}

describe('comunicados por HTTP (HU-COM-01..07)', () => {
  it('borrador → adjunto → publicar → leer y descargar → retirar', async () => {
    const created = await draft();
    expect(created.status).toBe('borrador');
    expect(
      listAnnouncementsResponseSchema.parse((await request(app).get(base()).set(as(socio))).body)
        .items,
    ).toEqual([]);

    const attached = await request(app)
      .post(`${base()}/${created.id}/adjuntos`)
      .set(as(admin))
      .attach('fichero', pdf, 'Orden del día – asamblea.pdf');
    expect(attached.status).toBe(201);
    expect(attached.body.name).toBe('Orden del día – asamblea.pdf');

    const published = await request(app).post(`${base()}/${created.id}/publicar`).set(as(admin));
    expect(published.status).toBe(200);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'ComunicadoPublicado',
        payload: { cooperativeId: campo, announcementId: created.id, title: 'Asamblea general' },
      }),
    ]);

    const list = listAnnouncementsResponseSchema.parse(
      (await request(app).get(base()).set(as(socio))).body,
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
      (await request(app).get(`${base()}/${created.id}`).set(as(socio))).body,
    );
    expect(detail.readStats).toBeNull();
    const download = await fetch(detail.attachments[0]!.url);
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(pdf);

    const relisted = listAnnouncementsResponseSchema.parse(
      (await request(app).get(base()).set(as(socio))).body,
    );
    expect(relisted.items[0]?.read).toBe(true);

    const stats = announcementDetailSchema.parse(
      (await request(app).get(`${base()}/${created.id}`).set(as(admin))).body,
    ).readStats;
    expect(stats).toEqual({ readCount: 2, activeMembers: 2 });

    await request(app).post(`${base()}/${created.id}/retirar`).set(as(admin));
    expect((await request(app).get(`${base()}/${created.id}`).set(as(socio))).status).toBe(404);
  });

  it('dos publicaciones simultáneas emiten un solo ComunicadoPublicado (RN-COM-07)', async () => {
    const created = await draft();

    const responses = await Promise.all(
      [1, 2].map(() => request(app).post(`${base()}/${created.id}/publicar`).set(as(admin))),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(events).toHaveLength(1);
  });

  it('la lectura se registra una sola vez (RN-COM-06)', async () => {
    const created = await draft();
    await request(app).post(`${base()}/${created.id}/publicar`).set(as(admin));

    await Promise.all(
      [1, 2, 3].map(() => request(app).get(`${base()}/${created.id}`).set(as(socio))),
    );

    expect(await prisma.announcementRead.count()).toBe(1);
  });

  it('publicar sin cuerpo indica qué falta', async () => {
    const created = announcementSchema.parse(
      (await request(app).post(base()).set(as(admin)).send({ title: 'Solo título', body: '' }))
        .body,
    );

    const response = await request(app).post(`${base()}/${created.id}/publicar`).set(as(admin));

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'invalid_announcement',
      details: { issues: ['body_missing'] },
    });
  });

  it('un fichero que no es PDF se rechaza por su contenido', async () => {
    const created = await draft();

    const response = await request(app)
      .post(`${base()}/${created.id}/adjuntos`)
      .set(as(admin))
      .attach('fichero', Buffer.from('<html>no soy un pdf</html>'), 'falso.pdf');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'attachment_rejected',
      details: { reason: 'not_pdf' },
    });
  });

  it('un adjunto de más de 10 MB se corta en la subida', async () => {
    const created = await draft();
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10 * 1024 * 1024)]);

    const response = await request(app)
      .post(`${base()}/${created.id}/adjuntos`)
      .set(as(admin))
      .attach('fichero', big, 'grande.pdf');

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual({ reason: 'too_large' });
    expect(await prisma.announcementAttachment.count()).toBe(0);
  });

  it('con consulta, las acciones de gestión responden 403 (HU-ACC-07)', async () => {
    const created = await draft();

    const responses = await Promise.all([
      request(app).post(base()).set(as(socio)).send({ title: 'x', body: 'y' }),
      request(app).patch(`${base()}/${created.id}`).set(as(socio)).send({ title: 'x' }),
      request(app).post(`${base()}/${created.id}/publicar`).set(as(socio)),
      request(app).post(`${base()}/${created.id}/retirar`).set(as(socio)),
      request(app)
        .post(`${base()}/${created.id}/adjuntos`)
        .set(as(socio))
        .attach('fichero', pdf, 'a.pdf'),
    ]);

    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
  });

  it('un comunicado de otra cooperativa responde 404 (ADR-003)', async () => {
    const created = await draft();
    await request(app).post(`${base()}/${created.id}/publicar`).set(as(admin));

    const response = await request(app).get(`${base()}/${created.id}`).set(as(otherCoopAdmin));

    expect(response.status).toBe(404);
  });
});
