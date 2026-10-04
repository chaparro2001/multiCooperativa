import {
  deliveryNoteSchema,
  invoiceDetailSchema,
  invoiceSchema,
  invoicingSummarySchema,
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
for (const type of ['AlbaranRegistrado', 'FacturaRegistrada', 'DiscrepanciaDetectada'] as const) {
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

let campo: string;
let gestor: string;
let consejo: string;
let supplier: string;
let otherSupplier: string;
let customer: string;
let otherCustomer: string;
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const base = () => `/cooperativas/${campo}`;

async function party(
  nif: string,
  name: string,
  roles: { isSupplier: boolean; isCustomer: boolean },
) {
  const response = await request(app)
    .post(`${base()}/terceros`)
    .set(as(gestor))
    .send({ nif, name, ...roles });
  return thirdPartySchema.parse(response.body).id;
}

/** multipart: the record in «datos», optionally the original in «fichero». */
function post(path: string, data: unknown, file?: { content: Buffer; name: string }) {
  const call = request(app)
    .post(`${base()}${path}`)
    .set(as(gestor))
    .field('datos', JSON.stringify(data));
  return file ? call.attach('fichero', file.content, file.name) : call;
}

const note = (
  number: string,
  lines: { concept: string; quantity: string; unit: string }[],
  thirdPartyId = supplier,
  operation = 'compra',
) => post('/albaranes', { thirdPartyId, operation, number, date: '2026-10-01', lines });

const invoice = (overrides: Record<string, unknown> = {}) =>
  post('/facturas', {
    thirdPartyId: supplier,
    operation: 'compra',
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
  campo = (
    await access.provisionCooperative({
      name: 'Campo',
      cif: 'F12345674',
      admin: { email: 'admin@campo.test', name: 'Ana', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  const common = { passwordOf: 'admin@campo.test', cooperativeId: campo };
  gestor = await memberToken(
    { prisma, app },
    { ...common, email: 'gestor@campo.test', profileName: 'Gestor', isPartner: false },
  );
  consejo = await memberToken(
    { prisma, app },
    { ...common, email: 'consejo@campo.test', profileName: 'Consejo rector', isPartner: true },
  );
  supplier = await party('B12345674', 'Abonos del Sur', { isSupplier: true, isCustomer: false });
  otherSupplier = await party('A58818501', 'Gasóleos Norte', {
    isSupplier: true,
    isCustomer: false,
  });
  customer = await party('12345678Z', 'Almazara Este', { isSupplier: false, isCustomer: true });
  otherCustomer = await party('00000000T', 'Aceites Oeste', {
    isSupplier: false,
    isCustomer: true,
  });
});
afterAll(() => prisma.$disconnect());

describe('albaranes (HU-FAC-02)', () => {
  it('Dado un proveedor activo y una línea válida, entonces queda pendiente de facturar y se emite AlbaranRegistrado', async () => {
    const response = await note('A-001', [
      { concept: 'Abono NPK', quantity: '1250.5', unit: 'kg' },
    ]);

    expect(response.status).toBe(201);
    expect(deliveryNoteSchema.parse(response.body)).toMatchObject({
      status: 'pendiente_facturar',
      lines: [{ quantity: '1250.5' }],
    });
    expect(events.map((e) => e.type)).toEqual(['AlbaranRegistrado']);
  });

  it('RN-FAC-04: un número repetido para el mismo tercero se rechaza; para otro tercero, no', async () => {
    const lines = [{ concept: 'Abono', quantity: '1', unit: 'kg' }];
    await note('A-001', lines);

    expect((await note('A-001', lines)).status).toBe(409);
    expect((await note('A-001', lines, otherSupplier)).status).toBe(201);
  });

  it('RN-FAC-03: una compra con un cliente se rechaza; una línea con cantidad cero también', async () => {
    const wrongParty = await note('A-1', [{ concept: 'X', quantity: '1', unit: 'kg' }], customer);
    const zero = await note('A-2', [{ concept: 'X', quantity: '0', unit: 'kg' }]);

    expect(wrongParty.status).toBe(400);
    expect(wrongParty.body.error).toBe('invalid_third_party');
    expect(zero.status).toBe(400);
  });

  it('guarda el original adjunto si es PDF o foto; otra cosa se rechaza', async () => {
    const lines = [{ concept: 'Abono', quantity: '1', unit: 'kg' }];
    const photo = await note('A-1', lines).field('x', '');
    expect(photo.status).toBe(400); // un campo de más no es un registro válido

    const jpeg = await post(
      '/albaranes',
      { thirdPartyId: supplier, operation: 'compra', number: 'A-2', date: '2026-10-01', lines },
      { content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]), name: 'foto albarán.jpeg' },
    );
    expect(deliveryNoteSchema.parse(jpeg.body).fileName).toBe('foto albarán.jpg');

    const html = await post(
      '/albaranes',
      { thirdPartyId: supplier, operation: 'compra', number: 'A-3', date: '2026-10-01', lines },
      { content: Buffer.from('<html>'), name: 'x.pdf' },
    );
    expect(html.status).toBe(400);
  });
});

describe('facturas y conciliación (HU-FAC-03, HU-FAC-04)', () => {
  it('Dado albaranes pendientes del mismo tercero, cuando la registro, entonces los factura y concilia', async () => {
    const a = deliveryNoteSchema.parse(
      (await note('A-1', [{ concept: 'Abono NPK', quantity: '600', unit: 'kg' }])).body,
    );
    const b = deliveryNoteSchema.parse(
      (await note('A-2', [{ concept: 'abono npk', quantity: '400', unit: 'kg' }])).body,
    );

    const response = await invoice({
      lines: [{ concept: 'Abono NPK', quantity: '1000', unit: 'kg' }],
      deliveryNoteIds: [a.id, b.id],
    });

    expect(response.status).toBe(201);
    expect(invoiceSchema.parse(response.body)).toMatchObject({
      paymentStatus: 'pendiente',
      reconciliationStatus: 'conciliada',
      total: '1210.00',
    });
    expect(await prisma.deliveryNote.count({ where: { status: 'facturado' } })).toBe(2);
    expect(events.map((e) => e.type)).toEqual([
      'AlbaranRegistrado',
      'AlbaranRegistrado',
      'FacturaRegistrada',
    ]);
  });

  it('Dado una diferencia superior a la tolerancia, entonces queda con discrepancia, con el detalle, y se emite DiscrepanciaDetectada', async () => {
    const a = deliveryNoteSchema.parse(
      (await note('A-1', [{ concept: 'Gasóleo', quantity: '1000', unit: 'l' }])).body,
    );

    const created = invoiceSchema.parse(
      (
        await invoice({
          lines: [{ concept: 'Gasóleo', quantity: '1050', unit: 'l' }],
          deliveryNoteIds: [a.id],
        })
      ).body,
    );
    const detail = invoiceDetailSchema.parse(
      (await request(app).get(`${base()}/facturas/${created.id}`).set(as(consejo))).body,
    );

    expect(detail.reconciliationStatus).toBe('con_discrepancia');
    expect(detail.discrepancies).toEqual([
      expect.objectContaining({
        concept: 'Gasóleo',
        unit: 'l',
        deliveredQuantity: '1000',
        invoicedQuantity: '1050',
        explanation: null,
      }),
    ]);
    expect(events.at(-1)?.type).toBe('DiscrepanciaDetectada');
  });

  it('Dado un total que no coincide con base más IVA, entonces se rechaza indicando la diferencia', async () => {
    const response = await invoice({ total: '1200.00' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'total_mismatch',
      details: { expected: '1210.00', difference: '-10.00' },
    });
  });

  it('una factura sin albaranes queda «sin albaranes»', async () => {
    expect(invoiceSchema.parse((await invoice()).body).reconciliationStatus).toBe('sin_albaranes');
  });

  it('Dado un albarán de otro tercero o ya facturado, cuando intento vincularlo, entonces se rechaza', async () => {
    const lines = [{ concept: 'Abono', quantity: '1', unit: 'kg' }];
    const other = deliveryNoteSchema.parse((await note('A-1', lines, otherSupplier)).body);
    const mine = deliveryNoteSchema.parse((await note('A-2', lines)).body);
    await invoice({ number: 'F-1', lines, deliveryNoteIds: [mine.id] });

    expect(
      (await invoice({ number: 'F-2', lines, deliveryNoteIds: [other.id] })).body.message,
    ).toMatch(/otro tercero/);
    expect(
      (await invoice({ number: 'F-3', lines, deliveryNoteIds: [mine.id] })).body.message,
    ).toMatch(/ya facturado/);
  });

  it('RN-FAC-05: dos facturas a la vez con el mismo albarán, solo una lo factura', async () => {
    const lines = [{ concept: 'Abono', quantity: '1', unit: 'kg' }];
    const a = deliveryNoteSchema.parse((await note('A-1', lines)).body);

    const responses = await Promise.all(
      ['F-1', 'F-2'].map((number) => invoice({ number, lines, deliveryNoteIds: [a.id] })),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await prisma.invoice.count()).toBe(1);
  });

  it('RN-FAC-04: recibidas únicas por proveedor; emitidas únicas por cooperativa', async () => {
    await invoice({ number: 'F-9' });
    expect((await invoice({ number: 'F-9' })).status).toBe(409);
    expect((await invoice({ number: 'F-9', thirdPartyId: otherSupplier })).status).toBe(201);

    const sale = { operation: 'venta', number: 'V-1' };
    expect((await invoice({ ...sale, thirdPartyId: customer })).status).toBe(201);
    expect((await invoice({ ...sale, thirdPartyId: otherCustomer })).status).toBe(409);
  });

  it('anular una factura devuelve sus albaranes a pendientes', async () => {
    const lines = [{ concept: 'Abono', quantity: '1', unit: 'kg' }];
    const a = deliveryNoteSchema.parse((await note('A-1', lines)).body);
    const created = invoiceSchema.parse((await invoice({ lines, deliveryNoteIds: [a.id] })).body);

    const cancelled = await request(app)
      .post(`${base()}/facturas/${created.id}/anular`)
      .set(as(gestor));

    expect(invoiceSchema.parse(cancelled.body).paymentStatus).toBe('anulada');
    expect((await prisma.deliveryNote.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
      'pendiente_facturar',
    );
  });
});

describe('pagos, cobros y resumen (HU-FAC-06, HU-FAC-07)', () => {
  it('el resumen suma con exactitud lo pendiente y lo vencido de pagos y cobros', async () => {
    const f1 = invoiceSchema.parse(
      (await invoice({ number: 'F-1', base: '0.10', total: '0.12' })).body,
    );
    await invoice({ number: 'F-2', base: '0.20', total: '0.24' });
    await invoice({
      number: 'V-1',
      operation: 'venta',
      thirdPartyId: customer,
      base: '100.00',
      total: '121.00',
    });
    await prisma.invoice.update({ where: { id: f1.id }, data: { paymentStatus: 'vencida' } });

    const summary = invoicingSummarySchema.parse(
      (await request(app).get(`${base()}/facturas/resumen`).set(as(consejo))).body,
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

  it('marcar pagada saca la factura de lo pendiente; no se liquida dos veces (RN-FAC-10)', async () => {
    const created = invoiceSchema.parse((await invoice()).body);

    const paid = await request(app)
      .post(`${base()}/facturas/${created.id}/liquidar`)
      .set(as(gestor))
      .send({ date: '2026-10-20' });
    const again = await request(app)
      .post(`${base()}/facturas/${created.id}/liquidar`)
      .set(as(gestor))
      .send({ date: '2026-10-21' });

    expect(invoiceSchema.parse(paid.body)).toMatchObject({
      paymentStatus: 'liquidada',
      settledAt: '2026-10-20',
    });
    expect(again.status).toBe(409);
    const summary = invoicingSummarySchema.parse(
      (await request(app).get(`${base()}/facturas/resumen`).set(as(gestor))).body,
    );
    expect(summary.toPay.pending).toBe('0.00');
  });

  it('la ficha del tercero muestra sus documentos y su saldo pendiente', async () => {
    await note('A-1', [{ concept: 'Abono', quantity: '1', unit: 'kg' }]);
    await invoice();

    const sheet = thirdPartySheetSchema.parse(
      (await request(app).get(`${base()}/terceros/${supplier}`).set(as(consejo))).body,
    );

    expect(sheet.deliveryNotes).toHaveLength(1);
    expect(sheet.invoices).toHaveLength(1);
    expect(sheet.balance.toPay.pending).toBe('1210.00');
  });

  it('el consejo rector consulta pero no registra (requisitos/05, apartado 10)', async () => {
    const response = await request(app)
      .post(`${base()}/facturas`)
      .set(as(consejo))
      .field('datos', '{}');

    expect(response.status).toBe(403);
  });
});
