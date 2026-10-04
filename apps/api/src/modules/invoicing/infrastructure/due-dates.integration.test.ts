import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import { InProcessEventBus } from '../../../shared/events';
import type { InvoicingEvent } from '../application/events';
import { addDays } from '../domain/documents';
import { runDueDatesJob, todayInSpain } from '../index';

const prisma = createTestPrisma();
const events: InvoicingEvent[] = [];
const bus = new InProcessEventBus<InvoicingEvent>({ onHandlerError: () => {} });
bus.subscribe('FacturaVencida', (event) => void events.push(event));
bus.subscribe('FacturaProximaAVencer', (event) => void events.push(event));

const today = todayInSpain();
const COOPS = ['40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002'];
let supplierOf: Record<string, string> = {};

async function invoice(
  cooperativeId: string,
  number: string,
  dueDate: string,
  paymentStatus: 'pendiente' | 'vencida' | 'liquidada' | 'anulada' = 'pendiente',
) {
  const row = await prisma.invoice.create({
    data: {
      cooperativeId,
      thirdPartyId: supplierOf[cooperativeId]!,
      operation: 'compra',
      number,
      issueDate: new Date(`${addDays(dueDate, -30)}T00:00:00Z`),
      dueDate: new Date(`${dueDate}T00:00:00Z`),
      base: '100.00',
      vatRate: '21',
      total: '121.00',
      paymentStatus,
      reconciliationStatus: 'sin_albaranes',
    },
  });
  return row.id;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  events.length = 0;
  supplierOf = {};
  for (const [i, cooperativeId] of COOPS.entries()) {
    const party = await prisma.thirdParty.create({
      data: {
        cooperativeId,
        nif: i === 0 ? 'B12345674' : 'A58818501',
        name: 'Proveedor',
        isSupplier: true,
        isCustomer: false,
      },
    });
    supplierOf[cooperativeId] = party.id;
  }
});
afterAll(() => prisma.$disconnect());

const run = () => runDueDatesJob({ prisma, events: bus });

describe('proceso diario de vencimientos (HU-FAC-07)', () => {
  it('marca vencidas las pendientes con vencimiento pasado y avisa de las que vencen en 3 días, en todas las cooperativas', async () => {
    const overdueA = await invoice(COOPS[0]!, 'F-1', addDays(today, -1));
    const overdueB = await invoice(COOPS[1]!, 'F-1', addDays(today, -10));
    const soon = await invoice(COOPS[0]!, 'F-2', addDays(today, 2));
    const dueToday = await invoice(COOPS[0]!, 'F-3', today);
    await invoice(COOPS[0]!, 'F-4', addDays(today, 10));
    await invoice(COOPS[0]!, 'F-5', addDays(today, -5), 'liquidada');
    await invoice(COOPS[0]!, 'F-6', addDays(today, -5), 'anulada');

    expect(await run()).toEqual({ overdue: 2, dueSoon: 2 });

    const statusOf = async (id: string) =>
      (await prisma.invoice.findUniqueOrThrow({ where: { id } })).paymentStatus;
    expect(await statusOf(overdueA)).toBe('vencida');
    expect(await statusOf(overdueB)).toBe('vencida');
    expect(await statusOf(soon)).toBe('pendiente');
    // RN-FAC-09: vence hoy, todavía no está vencida (es «anterior a hoy»).
    expect(await statusOf(dueToday)).toBe('pendiente');
    expect(
      events
        .filter((e) => e.type === 'FacturaVencida')
        .map((e) => e.payload.invoiceId)
        .sort(),
    ).toEqual([overdueA, overdueB].sort());
    expect(
      events
        .filter((e) => e.type === 'FacturaProximaAVencer')
        .map((e) => e.payload.invoiceId)
        .sort(),
    ).toEqual([soon, dueToday].sort());
  });

  it('RNF-FAC-04: ejecutarlo dos veces no cambia nada ni duplica avisos', async () => {
    await invoice(COOPS[0]!, 'F-1', addDays(today, -1));
    await invoice(COOPS[0]!, 'F-2', addDays(today, 1));

    await run();
    const afterFirst = events.length;
    expect(await run()).toEqual({ overdue: 0, dueSoon: 0 });
    await Promise.all([run(), run()]);

    expect(events).toHaveLength(afterFirst);
    expect(await prisma.invoiceReminder.count()).toBe(2);
  });

  it('una factura avisada como próxima a vencer recibe después su aviso de vencida', async () => {
    const id = await invoice(COOPS[0]!, 'F-1', addDays(today, 1));
    await run();
    await prisma.invoice.update({
      where: { id },
      data: { dueDate: new Date(`${addDays(today, -1)}T00:00:00Z`) },
    });

    await run();

    expect(events.map((e) => e.type)).toEqual(['FacturaProximaAVencer', 'FacturaVencida']);
  });
});
