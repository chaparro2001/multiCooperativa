import {
  invoicingAttentionSchema,
  invoicingSettingsSchema,
  listAuditResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { memberToken, TEST_PASSWORD } from '../../../../../test/members';
import { createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';
import { addDays } from '../../domain/documents';
import { todayInSpain } from '../../index';

/** BR-INV-15 (notice days per cooperative) and BR-INV-16 (attention counts of the home badges). */

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

const today = todayInSpain();
let farm: string;
let sea: string;
let admin: string;
let manager: string;
let board: string;
let member: string;
let seaAdmin: string;
let supplier: Record<string, string> = {};
let seq = 0;

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const path = (suffix: string, cooperativeId = farm) =>
  `/cooperatives/${cooperativeId}/invoicing${suffix}`;
const put = (token: string, body: unknown, cooperativeId = farm) =>
  request(app)
    .put(path('/settings', cooperativeId))
    .set(as(token))
    .send(body as object);

async function invoice(
  cooperativeId: string,
  dueIn: number,
  paymentStatus: 'pending' | 'overdue' | 'settled' | 'voided' = 'pending',
  operation: 'purchase' | 'sale' = 'purchase',
) {
  seq += 1;
  await prisma.invoice.create({
    data: {
      cooperativeId,
      thirdPartyId: supplier[cooperativeId]!,
      operation,
      number: `F-${seq}`,
      issueDate: new Date(`${addDays(today, -60)}T00:00:00Z`),
      dueDate: new Date(`${addDays(today, dueIn)}T00:00:00Z`),
      base: '100.00',
      vatRate: '21',
      total: '121.00',
      paymentStatus,
      reconciliationStatus: 'no_delivery_notes',
    },
  });
}

async function deliveryNote(
  cooperativeId: string,
  ageDays: number,
  status: 'pending_invoicing' | 'invoiced' | 'voided' = 'pending_invoicing',
) {
  seq += 1;
  await prisma.deliveryNote.create({
    data: {
      cooperativeId,
      thirdPartyId: supplier[cooperativeId]!,
      operation: 'purchase',
      number: `A-${seq}`,
      date: new Date(`${addDays(today, -ageDays)}T00:00:00Z`),
      status,
      lines: { create: { position: 1, concept: 'Fertilizer', quantity: '10', unit: 'kg' } },
    },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
  seq = 0;
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
  const common = { prisma, app };
  const login = (email: string) =>
    request(app)
      .post('/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .then((response) => response.body.accessToken as string);
  admin = await login('admin@farm.test');
  seaAdmin = await login('admin@sea.test');
  const base = { passwordOf: 'admin@farm.test', cooperativeId: farm };
  manager = await memberToken(common, {
    ...base,
    email: 'manager@farm.test',
    profileName: 'Gestor',
    isPartner: false,
  });
  board = await memberToken(common, {
    ...base,
    email: 'board@farm.test',
    profileName: 'Consejo rector',
    isPartner: true,
  });
  member = await memberToken(common, {
    ...base,
    email: 'member@farm.test',
    profileName: 'Socio',
    isPartner: true,
  });
  supplier = {};
  for (const [id, nif] of [
    [farm, 'B12345674'],
    [sea, 'A58818501'],
  ] as const) {
    supplier[id] = (
      await prisma.thirdParty.create({
        data: { cooperativeId: id, nif, name: 'Supplier', isSupplier: true, isCustomer: true },
      })
    ).id;
  }
});
afterAll(() => prisma.$disconnect());

describe('GET/PUT /invoicing/settings (BR-INV-15)', () => {
  it('starts at 15 days for anyone with invoicing access and for the administrator', async () => {
    for (const token of [manager, board, admin]) {
      const response = await request(app).get(path('/settings')).set(as(token));
      expect(response.status).toBe(200);
      expect(invoicingSettingsSchema.parse(response.body)).toEqual({ dueSoonDays: 15 });
    }
  });

  it('a member without invoicing access gets 403 on both', async () => {
    expect((await request(app).get(path('/settings')).set(as(member))).status).toBe(403);
    expect((await put(member, { dueSoonDays: 10 })).status).toBe(403);
  });

  it('only the administrator writes: the manager and the board get 403 and nothing changes', async () => {
    for (const token of [manager, board]) {
      expect((await put(token, { dueSoonDays: 10 })).status).toBe(403);
    }
    expect(await prisma.invoicingSettings.count()).toBe(0);
  });

  it('saves the value, shows it to the cooperative only, and audits the change', async () => {
    const response = await put(admin, { dueSoonDays: 7 });
    expect(response.status).toBe(200);
    expect(invoicingSettingsSchema.parse(response.body)).toEqual({ dueSoonDays: 7 });

    const read = await request(app).get(path('/settings')).set(as(manager));
    expect(read.body).toEqual({ dueSoonDays: 7 });
    const other = await request(app).get(path('/settings', sea)).set(as(seaAdmin));
    expect(other.body).toEqual({ dueSoonDays: 15 });

    const audit = await request(app).get(`/cooperatives/${farm}/audit`).set(as(admin));
    const event = listAuditResponseSchema
      .parse(audit.body)
      .events.find((candidate) => candidate.action === 'cooperative.invoicing_settings_changed');
    expect(event?.detail).toEqual({ dueSoonDays: { from: 15, to: 7 } });
  });

  it('writing the same value leaves no audit event', async () => {
    await put(admin, { dueSoonDays: 15 });
    const audit = await request(app).get(`/cooperatives/${farm}/audit`).set(as(admin));
    expect(
      listAuditResponseSchema
        .parse(audit.body)
        .events.filter((e) => e.action === 'cooperative.invoicing_settings_changed'),
    ).toHaveLength(0);
  });

  it.each([0, 91, -1, 2.5, '10', null])('rejects %j with 400 invalid_request', async (value) => {
    const response = await put(admin, { dueSoonDays: value });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
    expect(await prisma.invoicingSettings.count()).toBe(0);
  });

  it('accepts the limits 1 and 90', async () => {
    expect((await put(admin, { dueSoonDays: 1 })).body).toEqual({ dueSoonDays: 1 });
    expect((await put(admin, { dueSoonDays: 90 })).body).toEqual({ dueSoonDays: 90 });
  });

  it('keeps the reconciliation tolerance of the same row', async () => {
    await prisma.invoicingSettings.create({
      data: { cooperativeId: farm, toleranceBasisPoints: 250 },
    });
    await put(admin, { dueSoonDays: 20 });
    const row = await prisma.invoicingSettings.findUniqueOrThrow({
      where: { cooperativeId: farm },
    });
    expect(row).toMatchObject({ toleranceBasisPoints: 250, dueSoonDays: 20 });
  });

  it('the administrator of another cooperative gets 404', async () => {
    expect((await put(seaAdmin, { dueSoonDays: 5 }, farm)).status).toBe(404);
    expect((await request(app).get(path('/settings', farm)).set(as(seaAdmin))).status).toBe(404);
  });
});

describe('GET /invoicing/attention (BR-INV-16)', () => {
  beforeEach(async () => {
    // Invoices: overdue (status and date), due today, in 15 days, in 16 days, settled, voided, a sale.
    await invoice(farm, -30, 'overdue');
    await invoice(farm, -2);
    await invoice(farm, 0);
    await invoice(farm, 15, 'pending', 'sale');
    await invoice(farm, 16);
    await invoice(farm, -5, 'settled');
    await invoice(farm, -5, 'voided');
    // Delivery notes: 45 days old, 15 days (reaches 30 in 15 days), 14 days, invoiced, voided.
    await deliveryNote(farm, 45);
    await deliveryNote(farm, 15);
    await deliveryNote(farm, 14);
    await deliveryNote(farm, 90, 'invoiced');
    await deliveryNote(farm, 90, 'voided');
    // Another cooperative's documents never count here.
    await invoice(sea, -3);
    await deliveryNote(sea, 60);
  });

  const attention = async (token: string, cooperativeId = farm) =>
    request(app).get(path('/attention', cooperativeId)).set(as(token));

  it('counts with the default 15 days', async () => {
    const response = await attention(manager);
    expect(response.status).toBe(200);
    expect(invoicingAttentionSchema.parse(response.body)).toEqual({
      invoices: 4,
      deliveryNotes: 2,
      days: 15,
    });
  });

  it('follows the cooperative N, and N of 30 or more counts every pending note', async () => {
    await put(admin, { dueSoonDays: 1 });
    expect((await attention(board)).body).toEqual({ invoices: 3, deliveryNotes: 1, days: 1 });
    await put(admin, { dueSoonDays: 30 });
    expect((await attention(board)).body).toEqual({ invoices: 5, deliveryNotes: 3, days: 30 });
  });

  it('other cooperatives keep their own counts and window', async () => {
    expect((await attention(seaAdmin, sea)).body).toEqual({
      invoices: 1,
      deliveryNotes: 1,
      days: 15,
    });
  });

  it('a settled, voided or invoiced document stops counting', async () => {
    await prisma.invoice.updateMany({
      where: { cooperativeId: farm },
      data: { paymentStatus: 'settled' },
    });
    await prisma.deliveryNote.updateMany({
      where: { cooperativeId: farm },
      data: { status: 'invoiced' },
    });
    expect((await attention(manager)).body).toEqual({ invoices: 0, deliveryNotes: 0, days: 15 });
  });

  it('needs invoicing read: a member gets 403', async () => {
    expect((await attention(member)).status).toBe(403);
  });

  it('without a session it answers 401 and another cooperative 404', async () => {
    expect((await request(app).get(path('/attention'))).status).toBe(401);
    expect((await attention(seaAdmin, farm)).status).toBe(404);
  });
});
