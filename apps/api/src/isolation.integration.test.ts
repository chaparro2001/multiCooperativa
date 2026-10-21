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

const COOPERATIVE_ROUTE = /^\/cooperatives\/:cooperativeId(\/|$)/;

let fieldCoop: string;
let seaCoop: string;
/** A resource of each kind that belongs to the field cooperative, to aim at from the sea cooperative. */
let fieldCoopParams: Record<string, string>;
let marToken: string;
/** Valid bodies, so a cross-cooperative write is refused for the resource, not the body. */
let validBodies: Record<string, object>;

/** Marks a route that receives a PDF as multipart/form-data. */
const MULTIPART_PDF = { multipartField: 'file' } as const;

async function snapshot() {
  return {
    thirdParties: await prisma.thirdParty.findMany({
      where: { cooperativeId: fieldCoop },
      orderBy: { id: 'asc' },
    }),
    deliveryNotes: await prisma.deliveryNote.findMany({
      where: { cooperativeId: fieldCoop },
      orderBy: { id: 'asc' },
    }),
    invoices: await prisma.invoice.findMany({
      where: { cooperativeId: fieldCoop },
      orderBy: { id: 'asc' },
    }),
    assemblies: await prisma.assembly.findMany({
      where: { cooperativeId: fieldCoop },
      orderBy: { id: 'asc' },
      include: { points: { include: { attachments: true, voting: true } } },
    }),
    documents: await prisma.document.findMany({
      where: { cooperativeId: fieldCoop },
      orderBy: { id: 'asc' },
      include: { versions: true },
    }),
    announcements: await prisma.announcement.findMany({
      where: { cooperativeId: fieldCoop },
      orderBy: { id: 'asc' },
      include: { attachments: true, reads: true },
    }),
    memberships: await prisma.membership.findMany({
      where: { cooperativeId: fieldCoop },
      orderBy: { id: 'asc' },
      select: { id: true, status: true, profileId: true },
    }),
    assistantConversations: await prisma.assistantConversation.findMany({
      where: { cooperativeId: fieldCoop },
      orderBy: { id: 'asc' },
      include: { messages: true },
    }),
    capitalMovements: await prisma.capitalMovement.findMany({
      where: { cooperativeId: fieldCoop },
      orderBy: { id: 'asc' },
    }),
    branding: await prisma.cooperativeBranding.findMany({ where: { cooperativeId: fieldCoop } }),
    invoicingSettings: await prisma.invoicingSettings.findMany({
      where: { cooperativeId: fieldCoop },
    }),
    invitations: await prisma.invitation.count(),
    audit: await prisma.auditEvent.count({ where: { cooperativeId: fieldCoop } }),
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
  fieldCoop = (
    await access.provisionCooperative({
      name: 'Field Cooperative',
      cif: 'F12345678',
      admin: { email: 'admin@field.test', name: 'Ada', password: PASSWORD },
    })
  ).cooperativeId;
  seaCoop = (
    await access.provisionCooperative({
      name: 'Sea Cooperative',
      cif: 'F87654321',
      admin: { email: 'admin@sea.test', name: 'Grace', password: PASSWORD },
    })
  ).cooperativeId;

  const socio = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: fieldCoop, name: 'Socio' },
  });
  const margaret = await prisma.user.create({
    data: { email: 'margaret@field.test', name: 'Margaret' },
  });
  const member = await prisma.membership.create({
    data: { cooperativeId: fieldCoop, profileId: socio.id, userId: margaret.id, status: 'active' },
  });
  const announcement = await prisma.announcement.create({
    data: {
      cooperativeId: fieldCoop,
      authorMembershipId: member.id,
      title: 'Assembly',
      body: 'Call notice',
      status: 'published',
      publishedAt: new Date(),
    },
  });
  const document = await prisma.document.create({
    data: {
      cooperativeId: fieldCoop,
      title: 'Bylaws',
      category: 'bylaws',
      documentDate: new Date('2026-01-01'),
      versions: {
        create: {
          fileKey: `cooperatives/${fieldCoop}/documents/bylaws`,
          fileName: 'Bylaws.pdf',
          size: 10,
          isCurrent: true,
          uploadedByMembershipId: member.id,
        },
      },
    },
  });
  const assembly = await prisma.assembly.create({
    data: {
      cooperativeId: fieldCoop,
      type: 'ordinary',
      status: 'convened',
      firstCallAt: new Date('2026-12-01T18:00:00Z'),
      place: 'Social hall',
      points: {
        create: {
          position: 1,
          title: 'Accounts',
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
      cooperativeId: fieldCoop,
      nif: 'B12345674',
      name: 'Southern Fertilizers',
      isSupplier: true,
      isCustomer: false,
    },
  });
  const note = await prisma.deliveryNote.create({
    data: {
      cooperativeId: fieldCoop,
      thirdPartyId: thirdParty.id,
      operation: 'purchase',
      number: 'A-1',
      date: new Date('2026-10-01'),
      lines: { create: { position: 1, concept: 'Fertilizer', quantity: '10', unit: 'kg' } },
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      cooperativeId: fieldCoop,
      thirdPartyId: thirdParty.id,
      operation: 'purchase',
      number: 'F-1',
      issueDate: new Date('2026-10-01'),
      dueDate: new Date('2026-10-31'),
      base: '100.00',
      vatRate: '21',
      total: '121.00',
      reconciliationStatus: 'no_delivery_notes',
    },
  });
  await prisma.capitalMovement.create({
    data: {
      cooperativeId: fieldCoop,
      membershipId: member.id,
      date: new Date('2026-01-01'),
      type: 'mandatory_contribution',
      concept: 'Contribution',
      amount: '600.00',
      recordedByMembershipId: member.id,
    },
  });
  const conversation = await prisma.assistantConversation.create({
    data: {
      cooperativeId: fieldCoop,
      membershipId: member.id,
      messages: {
        create: [
          { role: 'user', content: 'Question' },
          { role: 'assistant', content: 'Answer' },
        ],
      },
    },
    include: { messages: true },
  });
  fieldCoopParams = {
    conversationId: conversation.id,
    messageId: conversation.messages.find((message) => message.role === 'assistant')!.id,
    noteId: note.id,
    invoiceId: invoice.id,
    thirdPartyId: thirdParty.id,
    cooperativeId: fieldCoop,
    memberId: member.id,
    membershipId: member.id,
    announcementId: announcement.id,
    documentId: document.id,
    assemblyId: assembly.id,
    pointId: assembly.points[0]!.id,
  };

  const marProfile = await prisma.profile.findFirstOrThrow({
    where: { cooperativeId: seaCoop, name: 'Socio' },
  });
  validBodies = {
    'PATCH /cooperatives/:cooperativeId/members/:memberId': { status: 'suspended' },
    'POST /cooperatives/:cooperativeId/members/:memberId/removal': {},
    'POST /cooperatives/:cooperativeId/members/:memberId/invitation': {},
    'PATCH /cooperatives/:cooperativeId/announcements/:announcementId': { title: 'Changed' },
    'POST /cooperatives/:cooperativeId/announcements/:announcementId/publish': {},
    'POST /cooperatives/:cooperativeId/announcements/:announcementId/withdraw': {},
    'POST /cooperatives/:cooperativeId/announcements/:announcementId/attachments': MULTIPART_PDF,
    'POST /cooperatives/:cooperativeId/announcements': { title: 'New', body: 'Text' },
    'POST /cooperatives/:cooperativeId/documents/:documentId/versions': MULTIPART_PDF,
    'POST /cooperatives/:cooperativeId/documents/:documentId/withdraw': {},
    'POST /cooperatives/:cooperativeId/documents/:documentId/republish': {},
    'POST /cooperatives/:cooperativeId/documents/:documentId/reindex': {},
    'PATCH /cooperatives/:cooperativeId/assemblies/:assemblyId': {
      type: 'ordinary',
      firstCallAt: '2026-12-01T18:00:00Z',
      secondCallAt: null,
      place: 'Another place',
      points: [{ title: 'X', description: '', votable: false, majority: null }],
    },
    'POST /cooperatives/:cooperativeId/assemblies/:assemblyId/convene': {},
    'POST /cooperatives/:cooperativeId/assemblies/:assemblyId/reschedule': {
      firstCallAt: '2027-12-01T18:00:00Z',
      place: 'Another place',
    },
    'POST /cooperatives/:cooperativeId/assemblies/:assemblyId/cancel': {},
    'POST /cooperatives/:cooperativeId/assemblies/:assemblyId/close': {},
    'POST /cooperatives/:cooperativeId/points/:pointId/documents': MULTIPART_PDF,
    'POST /cooperatives/:cooperativeId/points/:pointId/voting/open': {},
    'POST /cooperatives/:cooperativeId/points/:pointId/voting/close': {},
    'POST /cooperatives/:cooperativeId/points/:pointId/voting/votes': { choice: 'in_favor' },
    'POST /cooperatives/:cooperativeId/delivery-notes/:noteId/void': {},
    'POST /cooperatives/:cooperativeId/invoices/:invoiceId/settle': { date: '2026-10-15' },
    'POST /cooperatives/:cooperativeId/invoices/:invoiceId/void': {},
    'POST /cooperatives/:cooperativeId/invoices/:invoiceId/explanations': {},
    'PATCH /cooperatives/:cooperativeId/third-parties/:thirdPartyId': {
      name: 'Changed',
      isSupplier: true,
      isCustomer: false,
      email: null,
      phone: null,
      active: false,
    },
    'POST /cooperatives/:cooperativeId/assistant/conversations/:conversationId/messages': {
      content: 'Hello',
    },
    'DELETE /cooperatives/:cooperativeId/assistant/conversations/:conversationId': {},
    'POST /cooperatives/:cooperativeId/assistant/messages/:messageId/rating': {
      rating: 'helpful',
    },
    'POST /cooperatives/:cooperativeId/member-area/members/:membershipId/movements': {
      date: '2026-10-05',
      type: 'voluntary_contribution',
      concept: 'Extra',
      amount: '50.00',
    },
    'PUT /cooperatives/:cooperativeId/invoicing/settings': {
      invoiceNoticeEnabled: true,
      invoiceNoticeDays: 20,
      noteDeadlineEnabled: true,
      noteDeadlineDays: 30,
      noteNoticeEnabled: true,
      noteNoticeDays: 15,
    },
    'PUT /cooperatives/:cooperativeId/branding/primary-color': { primaryColor: '#1E5AA8' },
    'POST /cooperatives/:cooperativeId/members': {
      email: 'new@sea.test',
      name: 'New',
      profileId: marProfile.id,
      isPartner: false,
    },
  };

  const login = await request(app)
    .post('/auth/login')
    .send({ email: 'admin@sea.test', password: PASSWORD });
  marToken = authTokensSchema.parse(login.body).accessToken;
});
afterAll(() => prisma.$disconnect());

const send = (route: RegisteredRoute, path: string, token?: string, body: object = {}) => {
  const call = request(app)[route.method](path);
  if (token) call.set('Authorization', `Bearer ${token}`);
  if (route.method === 'get') return call;
  if (body === MULTIPART_PDF) {
    return call.attach(MULTIPART_PDF.multipartField, Buffer.from('%PDF-1.4 test'), 'a.pdf');
  }
  return call.send(body);
};

describe('route inventory', () => {
  it('finds the API routes (otherwise the tests below would prove nothing)', () => {
    const keys = routes.map(key);
    expect(keys).toEqual(expect.arrayContaining([...PUBLIC]));
    expect(keys).toContain('GET /cooperatives/:cooperativeId/members');
    expect(routes.filter((route) => COOPERATIVE_ROUTE.test(route.path)).length).toBeGreaterThan(5);
  });
});

describe('without a session (US-ACC-07)', () => {
  const privateRoutes = routes.filter((route) => !PUBLIC.has(key(route)));

  it.each(privateRoutes.map((route) => ({ ...route, name: key(route) })))(
    '$name responds 401 without a session',
    async (route) => {
      const path = COOPERATIVE_ROUTE.test(route.path)
        ? fillPath(route.path, fieldCoopParams)
        : route.path;

      const response = await send(route, path);

      expect(response.status).toBe(401);
    },
  );
});

describe('isolation between cooperatives (ADR-003)', () => {
  const cooperativeRoutes = routes.filter((route) => COOPERATIVE_ROUTE.test(route.path));

  it.each(cooperativeRoutes.map((route) => ({ ...route, name: key(route) })))(
    '$name: the administrator of another cooperative gets 404 and nothing changes',
    async (route) => {
      const before = await snapshot();

      const response = await send(
        route,
        fillPath(route.path, fieldCoopParams),
        marToken,
        validBodies[key(route)],
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'not_found', message: 'Not found.' });
      expect(await snapshot()).toEqual(before);
    },
  );

  // Routes that name a resource besides the cooperative: aimed at the field cooperative's resource
  // from inside the sea cooperative, where the caller has every permission.
  const resourceRoutes = cooperativeRoutes.filter((route) =>
    route.path.replace(COOPERATIVE_ROUTE, '/').includes(':'),
  );

  it.each(resourceRoutes.map((route) => ({ ...route, name: key(route) })))(
    '$name: a resource of another cooperative cannot be reached from your own',
    async (route) => {
      const body = validBodies[key(route)];
      if (route.method !== 'get' && !body) {
        throw new Error(`Add a valid body for ${key(route)} to validBodies.`);
      }
      const before = await snapshot();

      const response = await send(
        route,
        fillPath(route.path, { ...fieldCoopParams, cooperativeId: seaCoop }),
        marToken,
        body,
      );

      expect(response.status).toBe(404);
      expect(await snapshot()).toEqual(before);
    },
  );
});
