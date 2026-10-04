import { authTokensSchema } from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../test/database';
import { fillPath, listRoutes, type RegisteredRoute } from '../test/routes';
import { createApi } from './api';
import { loadEnv } from './config/env';
import { createAccessModule } from './modules/access';
import { HashingEmbedder } from './modules/documents';
import { InMemoryFileStorage } from './shared/files/in-memory-file-storage';

/**
 * ADR-003, mandatory measure 5: every endpoint is tried by a user of another
 * cooperative. The routes are read from the composed API, so a new endpoint
 * is covered as soon as it is registered.
 */

const PASSWORD = 'una-clave-larga';
const prisma = createTestPrisma();
const jwtSecret = loadEnv(process.env).JWT_SECRET;
const { app } = createApi({
  embedder: new HashingEmbedder(),
  prisma,
  jwtSecret,
  files: new InMemoryFileStorage(),
  authRateLimits: false,
  invitationSender: { send: async () => {} },
});
const routes = listRoutes(app);

const key = (route: RegisteredRoute) => `${route.method.toUpperCase()} ${route.path}`;

/** Endpoints that work without a session. Anything else must answer 401 without one. */
const PUBLIC = new Set([
  'GET /health',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'POST /auth/invitations/accept',
]);

const COOPERATIVE_ROUTE = /^\/cooperativas\/:cooperativeId(\/|$)/;

let campo: string;
let mar: string;
/** A resource of each kind that belongs to Campo, to aim at from Mar. */
let campoParams: Record<string, string>;
let marToken: string;
/** Valid bodies, so a cross-cooperative write is refused for the resource, not the body. */
let validBodies: Record<string, object>;

/** Marks a route that receives a PDF as multipart/form-data. */
const MULTIPART_PDF = { multipartField: 'fichero' } as const;

async function snapshot() {
  return {
    thirdParties: await prisma.thirdParty.findMany({
      where: { cooperativeId: campo },
      orderBy: { id: 'asc' },
    }),
    assemblies: await prisma.assembly.findMany({
      where: { cooperativeId: campo },
      orderBy: { id: 'asc' },
      include: { points: { include: { attachments: true, voting: true } } },
    }),
    documents: await prisma.document.findMany({
      where: { cooperativeId: campo },
      orderBy: { id: 'asc' },
      include: { versions: true },
    }),
    announcements: await prisma.announcement.findMany({
      where: { cooperativeId: campo },
      orderBy: { id: 'asc' },
      include: { attachments: true, reads: true },
    }),
    memberships: await prisma.membership.findMany({
      where: { cooperativeId: campo },
      orderBy: { id: 'asc' },
      select: { id: true, status: true, profileId: true },
    }),
    invitations: await prisma.invitation.count(),
    audit: await prisma.auditEvent.count({ where: { cooperativeId: campo } }),
  };
}

beforeAll(async () => {
  await resetDatabase(prisma);
  // Seeds through the module, as an operator would with the provisioning script.
  const access = createAccessModule({
    prisma,
    jwtSecret,
    invitationSender: { send: async () => {} },
  });
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

  const socio = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: campo, name: 'Socio' },
  });
  const margaret = await prisma.user.create({
    data: { email: 'margaret@campo.es', name: 'Margaret' },
  });
  const member = await prisma.membership.create({
    data: { cooperativeId: campo, profileId: socio.id, userId: margaret.id, status: 'activa' },
  });
  const announcement = await prisma.announcement.create({
    data: {
      cooperativeId: campo,
      authorMembershipId: member.id,
      title: 'Asamblea',
      body: 'Convocatoria',
      status: 'publicado',
      publishedAt: new Date(),
    },
  });
  const document = await prisma.document.create({
    data: {
      cooperativeId: campo,
      title: 'Estatutos',
      category: 'estatutos',
      documentDate: new Date('2026-01-01'),
      versions: {
        create: {
          fileKey: `cooperativas/${campo}/documentos/estatutos`,
          fileName: 'Estatutos.pdf',
          size: 10,
          isCurrent: true,
          uploadedByMembershipId: member.id,
        },
      },
    },
  });
  const assembly = await prisma.assembly.create({
    data: {
      cooperativeId: campo,
      type: 'ordinaria',
      status: 'convocada',
      firstCallAt: new Date('2026-12-01T18:00:00Z'),
      place: 'Salón social',
      points: {
        create: {
          position: 1,
          title: 'Cuentas',
          description: '',
          votable: true,
          majority: 'simple',
        },
      },
    },
    include: { points: true },
  });
  const thirdParty = await prisma.thirdParty.create({
    data: {
      cooperativeId: campo,
      nif: 'B12345674',
      name: 'Abonos del Sur',
      isSupplier: true,
      isCustomer: false,
    },
  });
  campoParams = {
    thirdPartyId: thirdParty.id,
    cooperativeId: campo,
    memberId: member.id,
    announcementId: announcement.id,
    documentId: document.id,
    assemblyId: assembly.id,
    pointId: assembly.points[0]!.id,
  };

  const marProfile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: mar, name: 'Socio' },
  });
  validBodies = {
    'PATCH /cooperativas/:cooperativeId/miembros/:memberId': { status: 'suspendida' },
    'POST /cooperativas/:cooperativeId/miembros/:memberId/baja': {},
    'POST /cooperativas/:cooperativeId/miembros/:memberId/invitacion': {},
    'PATCH /cooperativas/:cooperativeId/comunicados/:announcementId': { title: 'Cambiado' },
    'POST /cooperativas/:cooperativeId/comunicados/:announcementId/publicar': {},
    'POST /cooperativas/:cooperativeId/comunicados/:announcementId/retirar': {},
    'POST /cooperativas/:cooperativeId/comunicados/:announcementId/adjuntos': MULTIPART_PDF,
    'POST /cooperativas/:cooperativeId/comunicados': { title: 'Nuevo', body: 'Texto' },
    'POST /cooperativas/:cooperativeId/documentos/:documentId/versiones': MULTIPART_PDF,
    'POST /cooperativas/:cooperativeId/documentos/:documentId/retirar': {},
    'POST /cooperativas/:cooperativeId/documentos/:documentId/reindexar': {},
    'PATCH /cooperativas/:cooperativeId/asambleas/:assemblyId': {
      type: 'ordinaria',
      firstCallAt: '2026-12-01T18:00:00Z',
      secondCallAt: null,
      place: 'Otro lugar',
      points: [{ title: 'X', description: '', votable: false, majority: null }],
    },
    'POST /cooperativas/:cooperativeId/asambleas/:assemblyId/convocar': {},
    'POST /cooperativas/:cooperativeId/asambleas/:assemblyId/cancelar': {},
    'POST /cooperativas/:cooperativeId/asambleas/:assemblyId/cerrar': {},
    'POST /cooperativas/:cooperativeId/puntos/:pointId/documentos': MULTIPART_PDF,
    'POST /cooperativas/:cooperativeId/puntos/:pointId/votacion/abrir': {},
    'POST /cooperativas/:cooperativeId/puntos/:pointId/votacion/cerrar': {},
    'POST /cooperativas/:cooperativeId/puntos/:pointId/votacion/votos': { choice: 'a_favor' },
    'PATCH /cooperativas/:cooperativeId/terceros/:thirdPartyId': {
      name: 'Cambiado',
      isSupplier: true,
      isCustomer: false,
      email: null,
      phone: null,
      active: false,
    },
    'POST /cooperativas/:cooperativeId/miembros': {
      email: 'nuevo@mar.es',
      name: 'Nuevo',
      profileId: marProfile.id,
      isPartner: false,
    },
  };

  const login = await request(app)
    .post('/auth/login')
    .send({ email: 'admin@mar.es', password: PASSWORD });
  marToken = authTokensSchema.parse(login.body).accessToken;
});
afterAll(() => prisma.$disconnect());

const send = (route: RegisteredRoute, path: string, token?: string, body: object = {}) => {
  const call = request(app)[route.method](path);
  if (token) call.set('Authorization', `Bearer ${token}`);
  if (route.method === 'get') return call;
  if (body === MULTIPART_PDF) {
    return call.attach(MULTIPART_PDF.multipartField, Buffer.from('%PDF-1.4 prueba'), 'a.pdf');
  }
  return call.send(body);
};

describe('inventario de rutas', () => {
  it('encuentra las rutas de la API (si no, los tests de abajo no probarían nada)', () => {
    const keys = routes.map(key);
    expect(keys).toEqual(expect.arrayContaining([...PUBLIC]));
    expect(keys).toContain('GET /cooperativas/:cooperativeId/miembros');
    expect(routes.filter((route) => COOPERATIVE_ROUTE.test(route.path)).length).toBeGreaterThan(5);
  });
});

describe('sin sesión (HU-ACC-07)', () => {
  const privateRoutes = routes.filter((route) => !PUBLIC.has(key(route)));

  it.each(privateRoutes.map((route) => ({ ...route, name: key(route) })))(
    '$name responde 401 sin sesión',
    async (route) => {
      const path = COOPERATIVE_ROUTE.test(route.path)
        ? fillPath(route.path, campoParams)
        : route.path;

      const response = await send(route, path);

      expect(response.status).toBe(401);
    },
  );
});

describe('aislamiento entre cooperativas (ADR-003)', () => {
  const cooperativeRoutes = routes.filter((route) => COOPERATIVE_ROUTE.test(route.path));

  it.each(cooperativeRoutes.map((route) => ({ ...route, name: key(route) })))(
    '$name: el administrador de otra cooperativa recibe 404 y no cambia nada',
    async (route) => {
      const before = await snapshot();

      const response = await send(
        route,
        fillPath(route.path, campoParams),
        marToken,
        validBodies[key(route)],
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'not_found', message: 'No encontrado.' });
      expect(await snapshot()).toEqual(before);
    },
  );

  // Routes that name a resource besides the cooperative: aimed at Campo's resource
  // from inside Mar, where the caller has every permission.
  const resourceRoutes = cooperativeRoutes.filter((route) =>
    route.path.replace(COOPERATIVE_ROUTE, '/').includes(':'),
  );

  it.each(resourceRoutes.map((route) => ({ ...route, name: key(route) })))(
    '$name: un recurso de otra cooperativa no se alcanza desde la propia',
    async (route) => {
      const body = validBodies[key(route)];
      if (route.method !== 'get' && !body) {
        throw new Error(`Añade un cuerpo válido para ${key(route)} en validBodies.`);
      }
      const before = await snapshot();

      const response = await send(
        route,
        fillPath(route.path, { ...campoParams, cooperativeId: mar }),
        marToken,
        body,
      );

      expect(response.status).toBe(404);
      expect(await snapshot()).toEqual(before);
    },
  );
});
