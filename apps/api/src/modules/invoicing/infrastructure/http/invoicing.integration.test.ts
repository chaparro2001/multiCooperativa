import {
  deliveryNoteSchema,
  invoiceDetailSchema,
  invoiceSchema,
  invoicingSummarySchema,
  listDeliveryNotesResponseSchema,
  listInvoicesResponseSchema,
  thirdPartySchema,
  thirdPartySheetSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { memberToken, TEST_PASSWORD } from '../../../../../test/members';
import { type AppEvent, createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InProcessEventBus } from '../../../../shared/events';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';

const env = loadEnv(process.env);
const prisma = createTestPrisma();
const files = new InMemoryFileStorage();
const events: AppEvent[] = [];
const bus = new InProcessEventBus<AppEvent>({ onHandlerError: () => {} });
for (const type of [
  'DeliveryNoteRegistered',
  'InvoiceRegistered',
  'DiscrepancyDetected',
] as const) {
  bus.subscribe(type, (event) => void events.push(event));
}
const invitationSender = { send: async () => {} };
const { app } = createApi({
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender,
  files,
  embedder: new HashingEmbedder(),
  events: bus,
  authRateLimits: false,
});

let coop: string;
let manager: string;
let board: string;
let supplier: string;
let otherSupplier: string;
let customer: string;
let otherCustomer: string;
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const base = () => `/cooperatives/${coop}`;

async function party(
  nif: string,
  name: string,
  roles: { isSupplier: boolean; isCustomer: boolean },
) {
  const response = await request(app)
    .post(`${base()}/third-parties`)
    .set(as(manager))
    .send({ nif, name, ...roles });
  return thirdPartySchema.parse(response.body).id;
}

/** multipart: the record in “data”, optionally the original in “file”. */
function post(path: string, data: unknown, file?: { content: Buffer; name: string }) {
  const call = request(app)
    .post(`${base()}${path}`)
    .set(as(manager))
    .field('data', JSON.stringify(data));
  return file ? call.attach('file', file.content, file.name) : call;
}

const note = (
  number: string,
  lines: { concept: string; quantity: string; unit: string }[],
  thirdPartyId = supplier,
  operation = 'purchase',
) => post('/delivery-notes', { thirdPartyId, operation, number, date: '2026-10-01', lines });

const invoice = (overrides: Record<string, unknown> = {}) =>
  post('/invoices', {
    thirdPartyId: supplier,
    operation: 'purchase',
    number: 'F-001',
    issueDate: '2026-10-05',
    dueDate: '2026-11-05',
    base: '1000.00',
    vatRate: '21',
    total: '1210.00',
    lines: [],
    deliveryNoteIds: [],
    ...overrides,
  });

beforeEach(async () => {
  await resetDatabase(prisma);
  events.length = 0;
  const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET, invitationSender });
  coop = (
    await access.provisionCooperative({
      name: 'Farm',
      cif: 'F12345674',
      admin: { email: 'admin@coop.test', name: 'Ana', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  const common = { passwordOf: 'admin@coop.test', cooperativeId: coop };
  manager = await memberToken(
    { prisma, app },
    { ...common, email: 'manager@coop.test', profileName: 'Gestor', isPartner: false },
  );
  board = await memberToken(
    { prisma, app },
    { ...common, email: 'board@coop.test', profileName: 'Consejo rector', isPartner: true },
  );
  supplier = await party('B12345674', 'Southern Fertilizers', {
    isSupplier: true,
    isCustomer: false,
  });
  otherSupplier = await party('A58818501', 'North Diesel', {
    isSupplier: true,
    isCustomer: false,
  });
  customer = await party('12345678Z', 'Eastern Oil Mill', { isSupplier: false, isCustomer: true });
  otherCustomer = await party('00000000T', 'Western Oils', {
    isSupplier: false,
    isCustomer: true,
  });
});
afterAll(() => prisma.$disconnect());

describe('delivery notes (US-INV-02)', () => {
  it('Given an active supplier and a valid line, then it is pending invoicing and DeliveryNoteRegistered is emitted', async () => {
    const response = await note('A-001', [
      { concept: 'Fertilizer NPK', quantity: '1250.5', unit: 'kg' },
    ]);

    expect(response.status).toBe(201);
    expect(deliveryNoteSchema.parse(response.body)).toMatchObject({
      status: 'pending_invoicing',
      lines: [{ quantity: '1250.5' }],
    });
    expect(events.map((e) => e.type)).toEqual(['DeliveryNoteRegistered']);
  });

  it('BR-INV-04: a repeated number for the same third party is rejected; for another third party, it is not', async () => {
    const lines = [{ concept: 'Fertilizer', quantity: '1', unit: 'kg' }];
    await note('A-001', lines);

    expect((await note('A-001', lines)).status).toBe(409);
    expect((await note('A-001', lines, otherSupplier)).status).toBe(201);
  });

  it('BR-INV-03: a purchase with a customer is rejected; so is a line with zero quantity', async () => {
    const wrongParty = await note('A-1', [{ concept: 'X', quantity: '1', unit: 'kg' }], customer);
    const zero = await note('A-2', [{ concept: 'X', quantity: '0', unit: 'kg' }]);

    expect(wrongParty.status).toBe(400);
    expect(wrongParty.body.error).toBe('invalid_third_party');
    expect(zero.status).toBe(400);
  });

  it('stores the attached original if it is a PDF or photo; anything else is rejected', async () => {
    const lines = [{ concept: 'Fertilizer', quantity: '1', unit: 'kg' }];
    const photo = await note('A-1', lines).field('x', '');
    expect(photo.status).toBe(400); // an extra field is not a valid record

    const jpeg = await post(
      '/delivery-notes',
      { thirdPartyId: supplier, operation: 'purchase', number: 'A-2', date: '2026-10-01', lines },
      { content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]), name: 'delivery note photo.jpeg' },
    );
    expect(deliveryNoteSchema.parse(jpeg.body).fileName).toBe('delivery note photo.jpg');

    const html = await post(
      '/delivery-notes',
      { thirdPartyId: supplier, operation: 'purchase', number: 'A-3', date: '2026-10-01', lines },
      { content: Buffer.from('<html>'), name: 'x.pdf' },
    );
    expect(html.status).toBe(400);
  });
});

describe('invoices and reconciliation (US-INV-03, US-INV-04)', () => {
  it('Given pending delivery notes of the same third party, when I register it, then it invoices and reconciles them', async () => {
    const a = deliveryNoteSchema.parse(
      (await note('A-1', [{ concept: 'Fertilizer NPK', quantity: '600', unit: 'kg' }])).body,
    );
    const b = deliveryNoteSchema.parse(
      (await note('A-2', [{ concept: 'fertilizer npk', quantity: '400', unit: 'kg' }])).body,
    );

    const response = await invoice({
      lines: [{ concept: 'Fertilizer NPK', quantity: '1000', unit: 'kg' }],
      deliveryNoteIds: [a.id, b.id],
    });

    expect(response.status).toBe(201);
    expect(invoiceSchema.parse(response.body)).toMatchObject({
      paymentStatus: 'pending',
      reconciliationStatus: 'reconciled',
      total: '1210.00',
    });
    expect(await prisma.deliveryNote.count({ where: { status: 'invoiced' } })).toBe(2);
    expect(events.map((e) => e.type)).toEqual([
      'DeliveryNoteRegistered',
      'DeliveryNoteRegistered',
      'InvoiceRegistered',
    ]);
  });

  it('Given a difference above the tolerance, then it is left with a discrepancy, with the detail, and DiscrepancyDetected is emitted', async () => {
    const a = deliveryNoteSchema.parse(
      (await note('A-1', [{ concept: 'Diesel', quantity: '1000', unit: 'l' }])).body,
    );

    const created = invoiceSchema.parse(
      (
        await invoice({
          lines: [{ concept: 'Diesel', quantity: '1050', unit: 'l' }],
          deliveryNoteIds: [a.id],
        })
      ).body,
    );
    const detail = invoiceDetailSchema.parse(
      (await request(app).get(`${base()}/invoices/${created.id}`).set(as(board))).body,
    );

    expect(detail.reconciliationStatus).toBe('with_discrepancy');
    expect(detail.discrepancies).toEqual([
      expect.objectContaining({
        concept: 'Diesel',
        unit: 'l',
        deliveredQuantity: '1000',
        invoicedQuantity: '1050',
        explanation: null,
      }),
    ]);
    expect(events.at(-1)?.type).toBe('DiscrepancyDetected');
  });

  it('Given a total that does not match base plus VAT, then it is rejected stating the difference', async () => {
    const response = await invoice({ total: '1200.00' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'total_mismatch',
      details: { expected: '1210.00', difference: '-10.00' },
    });
  });

  it('an invoice without delivery notes is left as “no delivery notes”', async () => {
    expect(invoiceSchema.parse((await invoice()).body).reconciliationStatus).toBe(
      'no_delivery_notes',
    );
  });

  it('Given a delivery note of another third party or already invoiced, when I try to link it, then it is rejected', async () => {
    const lines = [{ concept: 'Fertilizer', quantity: '1', unit: 'kg' }];
    const other = deliveryNoteSchema.parse((await note('A-1', lines, otherSupplier)).body);
    const mine = deliveryNoteSchema.parse((await note('A-2', lines)).body);
    await invoice({ number: 'F-1', lines, deliveryNoteIds: [mine.id] });

    expect(
      (await invoice({ number: 'F-2', lines, deliveryNoteIds: [other.id] })).body.message,
    ).toMatch(/another third party/);
    expect(
      (await invoice({ number: 'F-3', lines, deliveryNoteIds: [mine.id] })).body.message,
    ).toMatch(/already invoiced/);
  });

  it('BR-INV-05: two invoices at once with the same delivery note, only one invoices it', async () => {
    const lines = [{ concept: 'Fertilizer', quantity: '1', unit: 'kg' }];
    const a = deliveryNoteSchema.parse((await note('A-1', lines)).body);

    const responses = await Promise.all(
      ['F-1', 'F-2'].map((number) => invoice({ number, lines, deliveryNoteIds: [a.id] })),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.invoice.count()).toBe(1);
  });

  it('BR-INV-04: received ones unique per supplier; issued ones unique per cooperative', async () => {
    await invoice({ number: 'F-9' });
    expect((await invoice({ number: 'F-9' })).status).toBe(409);
    expect((await invoice({ number: 'F-9', thirdPartyId: otherSupplier })).status).toBe(201);

    const sale = { operation: 'sale', number: 'V-1' };
    expect((await invoice({ ...sale, thirdPartyId: customer })).status).toBe(201);
    expect((await invoice({ ...sale, thirdPartyId: otherCustomer })).status).toBe(409);
  });

  it('voiding an invoice returns its delivery notes to pending', async () => {
    const lines = [{ concept: 'Fertilizer', quantity: '1', unit: 'kg' }];
    const a = deliveryNoteSchema.parse((await note('A-1', lines)).body);
    const created = invoiceSchema.parse((await invoice({ lines, deliveryNoteIds: [a.id] })).body);

    const cancelled = await request(app)
      .post(`${base()}/invoices/${created.id}/void`)
      .set(as(manager));

    expect(invoiceSchema.parse(cancelled.body).paymentStatus).toBe('voided');
    expect((await prisma.deliveryNote.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
      'pending_invoicing',
    );
  });
});

describe('payments, collections and summary (US-INV-06, US-INV-07)', () => {
  it('the summary exactly adds up what is pending and overdue of payments and collections', async () => {
    const f1 = invoiceSchema.parse(
      (await invoice({ number: 'F-1', base: '0.10', total: '0.12' })).body,
    );
    await invoice({ number: 'F-2', base: '0.20', total: '0.24' });
    await invoice({
      number: 'V-1',
      operation: 'sale',
      thirdPartyId: customer,
      base: '100.00',
      total: '121.00',
    });
    await prisma.invoice.update({ where: { id: f1.id }, data: { paymentStatus: 'overdue' } });

    const summary = invoicingSummarySchema.parse(
      (await request(app).get(`${base()}/invoices/summary`).set(as(board))).body,
    );

    expect(summary.toPay).toEqual({
      pending: '0.36',
      overdue: '0.12',
      pendingCount: 2,
      overdueCount: 1,
    });
    expect(summary.toCollect).toEqual({
      pending: '121.00',
      overdue: '0.00',
      pendingCount: 1,
      overdueCount: 0,
    });
  });

  it('marking as paid takes the invoice out of pending; it is not settled twice (BR-INV-10)', async () => {
    const created = invoiceSchema.parse((await invoice()).body);

    const paid = await request(app)
      .post(`${base()}/invoices/${created.id}/settle`)
      .set(as(manager))
      .send({ date: '2026-10-20' });
    const again = await request(app)
      .post(`${base()}/invoices/${created.id}/settle`)
      .set(as(manager))
      .send({ date: '2026-10-21' });

    expect(invoiceSchema.parse(paid.body)).toMatchObject({
      paymentStatus: 'settled',
      settledAt: '2026-10-20',
    });
    expect(again.status).toBe(409);
    const summary = invoicingSummarySchema.parse(
      (await request(app).get(`${base()}/invoices/summary`).set(as(manager))).body,
    );
    expect(summary.toPay.pending).toBe('0.00');
  });

  it('the third-party sheet shows its documents and its pending balance', async () => {
    await note('A-1', [{ concept: 'Fertilizer', quantity: '1', unit: 'kg' }]);
    await invoice();

    const sheet = thirdPartySheetSchema.parse(
      (await request(app).get(`${base()}/third-parties/${supplier}`).set(as(board))).body,
    );

    expect(sheet.deliveryNotes).toHaveLength(1);
    expect(sheet.invoices).toHaveLength(1);
    expect(sheet.balance.toPay.pending).toBe('1210.00');
  });

  it('the board can read but cannot register (requirements/05, section 10)', async () => {
    const response = await request(app)
      .post(`${base()}/invoices`)
      .set(as(board))
      .field('data', '{}');

    expect(response.status).toBe(403);
  });
});

describe('keyset pagination of the lists (US-INV-06)', () => {
  const list = (path: string, query: Record<string, string | number>, token = board) =>
    request(app).get(`${base()}${path}`).query(query).set(as(token));

  /** Follows nextCursor to the end; every page is parsed with the contract. */
  async function crawl(
    path: string,
    schema: typeof listInvoicesResponseSchema | typeof listDeliveryNotesResponseSchema,
    query: Record<string, string | number>,
  ) {
    const pages: { id: string; number: string }[][] = [];
    let before: string | undefined;
    do {
      const response = await list(path, { ...query, ...(before && { before }) });
      expect(response.status).toBe(200);
      const page = schema.parse(response.body);
      pages.push(page.items);
      before = page.nextCursor ?? undefined;
    } while (before);
    return pages;
  }

  it('walks every invoice once, newest first, across page boundaries and ties on date and number', async () => {
    // Same issue date and same number for two different suppliers: only the id breaks the tie.
    for (const [number, date, party] of [
      ['F-100', '2026-10-05', supplier],
      ['F-100', '2026-10-05', otherSupplier],
      ['F-099', '2026-10-05', supplier],
      ['F-300', '2026-10-01', supplier],
      ['F-200', '2026-10-07', otherSupplier],
    ] as const) {
      const response = await invoice({
        number,
        issueDate: date,
        dueDate: '2026-12-01',
        thirdPartyId: party,
      });
      expect(response.status).toBe(201);
    }

    const pages = await crawl('/invoices', listInvoicesResponseSchema, {
      operation: 'purchase',
      limit: 2,
    });

    expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
    const all = pages.flat();
    expect(new Set(all.map((row) => row.id)).size).toBe(5);
    expect(all.map((row) => row.number)).toEqual(['F-200', 'F-100', 'F-100', 'F-099', 'F-300']);
  });

  it('keeps the filters working with the cursor and the summary does not depend on the page', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await invoice({
        number: `P-${i}`,
        issueDate: `2026-10-0${i}`,
        base: '10.00',
        total: '12.10',
      });
    }
    await invoice({ number: 'S-1', operation: 'sale', thirdPartyId: customer });
    const mine = invoiceSchema.parse(
      (await invoice({ number: 'P-6', issueDate: '2026-10-06', base: '10.00', total: '12.10' }))
        .body,
    );
    await prisma.invoice.update({ where: { id: mine.id }, data: { paymentStatus: 'overdue' } });

    const purchases = (
      await crawl('/invoices', listInvoicesResponseSchema, { operation: 'purchase', limit: 4 })
    ).flat();
    const overdue = (
      await crawl('/invoices', listInvoicesResponseSchema, {
        operation: 'purchase',
        status: 'overdue',
        limit: 1,
      })
    ).flat();
    const byParty = (
      await crawl('/invoices', listInvoicesResponseSchema, {
        thirdParty: otherSupplier,
        limit: 1,
      })
    ).flat();

    expect(purchases).toHaveLength(6);
    expect(overdue.map((row) => row.number)).toEqual(['P-6']);
    expect(byParty).toEqual([]);
    const summary = invoicingSummarySchema.parse(
      (await request(app).get(`${base()}/invoices/summary`).set(as(board))).body,
    );
    expect(summary.toPay.pendingCount).toBe(6);
    expect(summary.toPay.pending).toBe('72.60');
  });

  it('pages delivery notes with the same cursor style and the status filter', async () => {
    for (const number of ['A-1', 'A-2', 'A-3']) {
      await note(number, [{ concept: 'Fertilizer', quantity: '1', unit: 'kg' }]);
    }
    await note('B-1', [{ concept: 'Fertilizer', quantity: '1', unit: 'kg' }], otherSupplier);

    const pages = await crawl('/delivery-notes', listDeliveryNotesResponseSchema, {
      operation: 'purchase',
      status: 'pending_invoicing',
      limit: 3,
    });
    expect(pages.map((page) => page.length)).toEqual([3, 1]);
    expect(pages.flat().map((row) => row.number)).toEqual(['B-1', 'A-3', 'A-2', 'A-1']);
  });

  it('uses the default page size and refuses a cursor it did not issue or a limit out of range', async () => {
    const first = await list('/invoices', {});
    expect(listInvoicesResponseSchema.parse(first.body)).toEqual({ items: [], nextCursor: null });

    expect((await list('/invoices', { before: 'not-a-cursor' })).status).toBe(400);
    expect((await list('/delivery-notes', { limit: 0 })).status).toBe(400);
    expect((await list('/delivery-notes', { limit: 1000 })).status).toBe(400);
  });

  it('ADR-003: a cursor from one cooperative never shows rows of another, and the other cooperative gets 404', async () => {
    await invoice({ number: 'F-1' });
    await invoice({ number: 'F-2', issueDate: '2026-10-06' });
    const page = listInvoicesResponseSchema.parse((await list('/invoices', { limit: 1 })).body);

    const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET, invitationSender });
    const other = (
      await access.provisionCooperative({
        name: 'Other',
        cif: 'G12345675',
        admin: { email: 'other-admin@coop.test', name: 'Eva', password: TEST_PASSWORD },
      })
    ).cooperativeId;
    const otherToken = await memberToken(
      { prisma, app },
      {
        passwordOf: 'other-admin@coop.test',
        cooperativeId: other,
        email: 'other-board@coop.test',
        profileName: 'Consejo rector',
        isPartner: true,
      },
    );

    const own = await request(app)
      .get(`/cooperatives/${other}/invoices`)
      .query({ before: page.nextCursor! })
      .set(as(otherToken));
    expect(listInvoicesResponseSchema.parse(own.body)).toEqual({ items: [], nextCursor: null });
    const foreign = await request(app)
      .get(`${base()}/invoices`)
      .query({ before: page.nextCursor! })
      .set(as(otherToken));
    expect([403, 404]).toContain(foreign.status);
  });
});
