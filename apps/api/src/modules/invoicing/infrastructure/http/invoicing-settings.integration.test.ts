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

/** BR-INV-15 (three alerts per cooperative, each one switchable) and BR-INV-16 (attention counts of the home badges). */

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

const DEFAULTS = {
  invoiceNoticeEnabled: true,
  invoiceNoticeDays: 15,
  noteDeadlineEnabled: true,
  noteDeadlineDays: 30,
  noteNoticeEnabled: true,
  noteNoticeDays: 15,
};
const body = (changes: Record<string, unknown> = {}) => ({ ...DEFAULTS, ...changes });

describe('GET/PUT /invoicing/settings (BR-INV-15)', () => {
  it('starts with the defaults for anyone with invoicing access and for the administrator', async () => {
    for (const token of [manager, board, admin]) {
      const response = await request(app).get(path('/settings')).set(as(token));
      expect(response.status).toBe(200);
      expect(invoicingSettingsSchema.parse(response.body)).toEqual(DEFAULTS);
    }
  });

  it('a member without invoicing access gets 403 on both', async () => {
    expect((await request(app).get(path('/settings')).set(as(member))).status).toBe(403);
    expect((await put(member, body({ invoiceNoticeDays: 10 }))).status).toBe(403);
  });

  it('only the administrator writes: the manager and the board get 403 and nothing changes', async () => {
    for (const token of [manager, board]) {
      expect((await put(token, body({ invoiceNoticeDays: 10 }))).status).toBe(403);
    }
    expect(await prisma.invoicingSettings.count()).toBe(0);
  });

  it('saves the values, shows them to the cooperative only, and audits each changed field', async () => {
    const next = body({ invoiceNoticeDays: 7, noteDeadlineEnabled: false, noteNoticeDays: 5 });
    const response = await put(admin, next);
    expect(response.status).toBe(200);
    expect(invoicingSettingsSchema.parse(response.body)).toEqual(next);

    const read = await request(app).get(path('/settings')).set(as(manager));
    expect(read.body).toEqual(next);
    const other = await request(app).get(path('/settings', sea)).set(as(seaAdmin));
    expect(other.body).toEqual(DEFAULTS);

    const audit = await request(app).get(`/cooperatives/${farm}/audit`).set(as(admin));
    const event = listAuditResponseSchema
      .parse(audit.body)
      .events.find((candidate) => candidate.action === 'cooperative.invoicing_settings_changed');
    expect(event?.detail).toEqual({
      invoiceNoticeDays: { from: 15, to: 7 },
      noteDeadlineEnabled: { from: true, to: false },
      noteNoticeDays: { from: 15, to: 5 },
    });
  });

  it('writing the same values leaves no audit event', async () => {
    await put(admin, body());
    const audit = await request(app).get(`/cooperatives/${farm}/audit`).set(as(admin));
    expect(
      listAuditResponseSchema
        .parse(audit.body)
        .events.filter((e) => e.action === 'cooperative.invoicing_settings_changed'),
    ).toHaveLength(0);
  });

  it.each([
    ['invoiceNoticeDays', 0],
    ['invoiceNoticeDays', 91],
    ['invoiceNoticeDays', 2.5],
    ['invoiceNoticeDays', '10'],
    ['noteDeadlineDays', 0],
    ['noteDeadlineDays', 366],
    ['noteNoticeDays', 0],
    ['noteNoticeDays', 366],
    ['noteNoticeDays', null],
    ['invoiceNoticeEnabled', 'yes'],
    ['noteDeadlineEnabled', null],
    ['noteNoticeEnabled', 1],
  ])('rejects %s = %j with 400 invalid_request naming the field', async (field, value) => {
    const response = await put(admin, body({ [field]: value }));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
    expect(JSON.stringify(response.body.details)).toContain(field);
    expect(await prisma.invoicingSettings.count()).toBe(0);
  });

  it('rejects a missing field and unknown fields', async () => {
    const { noteNoticeDays: _omitted, ...incomplete } = body();
    expect((await put(admin, incomplete)).status).toBe(400);
    expect((await put(admin, body({ dueSoonDays: 10 }))).status).toBe(400);
  });

  it('a note notice not shorter than the deadline is 400 with details.field noteNoticeDays', async () => {
    for (const noteNoticeDays of [30, 45]) {
      const response = await put(admin, body({ noteDeadlineDays: 30, noteNoticeDays }));
      expect(response.status).toBe(400);
      expect(response.body.details).toEqual({ field: 'noteNoticeDays' });
    }
    expect(await prisma.invoicingSettings.count()).toBe(0);
  });

  it('that rule does not apply when the notice or the deadline is off; the number is kept', async () => {
    const off = body({ noteDeadlineDays: 10, noteNoticeDays: 50, noteNoticeEnabled: false });
    expect((await put(admin, off)).body).toEqual(off);
    const deadlineOff = body({
      noteDeadlineEnabled: false,
      noteDeadlineDays: 10,
      noteNoticeDays: 50,
    });
    expect((await put(admin, deadlineOff)).body).toEqual(deadlineOff);
    expect((await request(app).get(path('/settings')).set(as(manager))).body).toEqual(deadlineOff);
  });

  it('accepts the limits of each range', async () => {
    const limits = body({ invoiceNoticeDays: 1, noteDeadlineDays: 365, noteNoticeDays: 364 });
    expect((await put(admin, limits)).body).toEqual(limits);
    const upper = body({
      invoiceNoticeDays: 90,
      noteDeadlineDays: 1,
      noteNoticeEnabled: false,
      noteNoticeDays: 365,
    });
    expect((await put(admin, upper)).body).toEqual(upper);
  });

  it('keeps the reconciliation tolerance of the same row', async () => {
    await prisma.invoicingSettings.create({
      data: { cooperativeId: farm, toleranceBasisPoints: 250 },
    });
    await put(admin, body({ invoiceNoticeDays: 20 }));
    const row = await prisma.invoicingSettings.findUniqueOrThrow({
      where: { cooperativeId: farm },
    });
    expect(row).toMatchObject({ toleranceBasisPoints: 250, invoiceNoticeDays: 20 });
  });

  it('the administrator of another cooperative gets 404', async () => {
    expect((await put(seaAdmin, body({ invoiceNoticeDays: 5 }), farm)).status).toBe(404);
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
    // Delivery notes: 45 days old, 15 days (reaches the 30 in 15 days), 14 days, invoiced, voided.
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
  const counts = async (changes: Record<string, unknown>) => {
    expect((await put(admin, body(changes))).status).toBe(200);
    const { invoices, deliveryNotes } = (await attention(board)).body;
    return { invoices, deliveryNotes };
  };

  it('counts with the defaults and returns the effective settings', async () => {
    const response = await attention(manager);
    expect(response.status).toBe(200);
    expect(invoicingAttentionSchema.parse(response.body)).toEqual({
      invoices: 4,
      deliveryNotes: 2,
      settings: DEFAULTS,
    });
  });

  it('invoice notice: its days widen or narrow the window; off counts only the overdue ones', async () => {
    expect(await counts({ invoiceNoticeDays: 1 })).toMatchObject({ invoices: 3 });
    expect(await counts({ invoiceNoticeDays: 90 })).toMatchObject({ invoices: 5 });
    expect(await counts({ invoiceNoticeEnabled: false })).toMatchObject({ invoices: 2 });
    expect(await counts({ invoiceNoticeEnabled: false, invoiceNoticeDays: 90 })).toMatchObject({
      invoices: 2,
    });
  });

  it('delivery notes, every combination of the two switches', async () => {
    // Deadline on, notice on: past the deadline or reaching it within the notice days.
    expect(await counts({})).toMatchObject({ deliveryNotes: 2 });
    expect(await counts({ noteNoticeDays: 16 })).toMatchObject({ deliveryNotes: 3 });
    expect(await counts({ noteNoticeDays: 14 })).toMatchObject({ deliveryNotes: 1 });
    expect(await counts({ noteNoticeDays: 15, noteDeadlineDays: 29 })).toMatchObject({
      deliveryNotes: 3,
    });
    // Deadline on, notice off: only the notes already past the deadline.
    expect(await counts({ noteNoticeEnabled: false })).toMatchObject({ deliveryNotes: 1 });
    // Deadline off: no concept at all, the notice does not matter.
    expect(await counts({ noteDeadlineEnabled: false })).toMatchObject({ deliveryNotes: 0 });
    expect(await counts({ noteDeadlineEnabled: false, noteNoticeEnabled: false })).toMatchObject({
      deliveryNotes: 0,
    });
  });

  it('a custom deadline replaces the 30 days', async () => {
    expect(await counts({ noteDeadlineDays: 60, noteNoticeEnabled: false })).toMatchObject({
      deliveryNotes: 0,
    });
    expect(await counts({ noteDeadlineDays: 45, noteNoticeEnabled: false })).toMatchObject({
      deliveryNotes: 1,
    });
    expect(await counts({ noteDeadlineDays: 14, noteNoticeEnabled: false })).toMatchObject({
      deliveryNotes: 3,
    });
  });

  it('the three alerts are independent: each can be off without touching the others', async () => {
    expect(await counts({ invoiceNoticeEnabled: false })).toEqual({
      invoices: 2,
      deliveryNotes: 2,
    });
    expect(await counts({ noteDeadlineEnabled: false })).toEqual({ invoices: 4, deliveryNotes: 0 });
    expect(await counts({ noteNoticeEnabled: false })).toEqual({ invoices: 4, deliveryNotes: 1 });
  });

  it('the summary of the invoices screen counts the stale notes with the same deadline', async () => {
    const stale = async () =>
      (await request(app).get(`/cooperatives/${farm}/invoices/summary`).set(as(board))).body
        .staleDeliveryNotes;
    expect(await stale()).toBe(1);
    await put(admin, body({ noteDeadlineDays: 14, noteNoticeDays: 7 }));
    expect(await stale()).toBe(3);
    await put(admin, body({ noteDeadlineEnabled: false }));
    expect(await stale()).toBe(0);
  });

  it('other cooperatives keep their own counts and settings', async () => {
    await put(admin, body({ invoiceNoticeEnabled: false, noteDeadlineEnabled: false }));
    expect((await attention(seaAdmin, sea)).body).toEqual({
      invoices: 1,
      deliveryNotes: 1,
      settings: DEFAULTS,
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
    expect((await attention(manager)).body).toMatchObject({ invoices: 0, deliveryNotes: 0 });
  });

  it('needs invoicing read: a member gets 403', async () => {
    expect((await attention(member)).status).toBe(403);
  });

  it('without a session it answers 401 and another cooperative 404', async () => {
    expect((await request(app).get(path('/attention'))).status).toBe(401);
    expect((await attention(seaAdmin, farm)).status).toBe(404);
  });
});
