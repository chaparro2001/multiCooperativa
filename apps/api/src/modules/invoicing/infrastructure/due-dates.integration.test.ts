import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import { InProcessEventBus } from '../../../shared/events';
import type { InvoicingEvent } from '../application/events';
import { addDays } from '../domain/documents';
import { runDueDatesJob, todayInSpain } from '../index';

const prisma = createTestPrisma();
const events: InvoicingEvent[] = [];
const bus = new InProcessEventBus<InvoicingEvent>({ onHandlerError: () => {} });
bus.subscribe('InvoiceOverdue', (event) => void events.push(event));
bus.subscribe('InvoiceDueSoon', (event) => void events.push(event));

const today = todayInSpain();
const COOPS = ['40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002'];
let supplierOf: Record<string, string> = {};

async function invoice(
  cooperativeId: string,
  number: string,
  dueDate: string,
  paymentStatus: 'pending' | 'overdue' | 'settled' | 'voided' = 'pending',
) {
  const row = await prisma.invoice.create({
    data: {
      cooperativeId,
      thirdPartyId: supplierOf[cooperativeId]!,
      operation: 'purchase',
      number,
      issueDate: new Date(`${addDays(dueDate, -30)}T00:00:00Z`),
      dueDate: new Date(`${dueDate}T00:00:00Z`),
      base: '100.00',
      vatRate: '21',
      total: '121.00',
      paymentStatus,
      reconciliationStatus: 'no_delivery_notes',
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
        name: 'Supplier',
        isSupplier: true,
        isCustomer: false,
      },
    });
    supplierOf[cooperativeId] = party.id;
  }
});
afterAll(() => prisma.$disconnect());

const run = () => runDueDatesJob({ prisma, events: bus });

describe('daily due-date process (US-INV-07)', () => {
  it('marks as overdue the pending ones past due and warns about those due within the window, in all cooperatives', async () => {
    const overdueA = await invoice(COOPS[0]!, 'F-1', addDays(today, -1));
    const overdueB = await invoice(COOPS[1]!, 'F-1', addDays(today, -10));
    const soon = await invoice(COOPS[0]!, 'F-2', addDays(today, 2));
    const dueToday = await invoice(COOPS[0]!, 'F-3', today);
    await invoice(COOPS[0]!, 'F-4', addDays(today, 40));
    await invoice(COOPS[0]!, 'F-5', addDays(today, -5), 'settled');
    await invoice(COOPS[0]!, 'F-6', addDays(today, -5), 'voided');

    expect(await run()).toEqual({ overdue: 2, dueSoon: 2 });
    // (F-4, due in 40 days, is outside the default 15-day window.)

    const statusOf = async (id: string) =>
      (await prisma.invoice.findUniqueOrThrow({ where: { id } })).paymentStatus;
    expect(await statusOf(overdueA)).toBe('overdue');
    expect(await statusOf(overdueB)).toBe('overdue');
    expect(await statusOf(soon)).toBe('pending');
    // BR-INV-09: due today, not overdue yet (it is “before today”).
    expect(await statusOf(dueToday)).toBe('pending');
    expect(
      events
        .filter((e) => e.type === 'InvoiceOverdue')
        .map((e) => e.payload.invoiceId)
        .sort(),
    ).toEqual([overdueA, overdueB].sort());
    expect(
      events
        .filter((e) => e.type === 'InvoiceDueSoon')
        .map((e) => e.payload.invoiceId)
        .sort(),
    ).toEqual([soon, dueToday].sort());
  });

  it('BR-INV-15: the warning window is each cooperative own N, 15 days by default', async () => {
    await prisma.invoicingSettings.create({
      data: { cooperativeId: COOPS[1]!, invoiceNoticeDays: 3 },
    });
    const defaultIn15 = await invoice(COOPS[0]!, 'F-1', addDays(today, 15));
    const defaultIn16 = await invoice(COOPS[0]!, 'F-2', addDays(today, 16));
    const narrowIn3 = await invoice(COOPS[1]!, 'F-1', addDays(today, 3));
    const narrowIn4 = await invoice(COOPS[1]!, 'F-2', addDays(today, 4));

    expect(await run()).toEqual({ overdue: 0, dueSoon: 2 });
    const warned = () =>
      events
        .filter((e) => e.type === 'InvoiceDueSoon')
        .map((e) => e.payload.invoiceId)
        .sort();
    expect(warned()).toEqual([defaultIn15, narrowIn3].sort());

    // The administrator widens the window: the invoices that enter it are warned once.
    await prisma.invoicingSettings.update({
      where: { cooperativeId: COOPS[1]! },
      data: { invoiceNoticeDays: 30 },
    });
    expect(await run()).toEqual({ overdue: 0, dueSoon: 1 });
    expect(warned()).toEqual([defaultIn15, narrowIn3, narrowIn4].sort());
    expect(warned()).not.toContain(defaultIn16);
    expect(await run()).toEqual({ overdue: 0, dueSoon: 0 });
  });

  it('BR-INV-15: a cooperative with the invoice notice off gets no due-soon reminder but still its overdue handling', async () => {
    await prisma.invoicingSettings.create({
      data: { cooperativeId: COOPS[1]!, invoiceNoticeEnabled: false, invoiceNoticeDays: 30 },
    });
    const onSoon = await invoice(COOPS[0]!, 'F-1', addDays(today, 3));
    const offSoon = await invoice(COOPS[1]!, 'F-1', addDays(today, 3));
    const offOverdue = await invoice(COOPS[1]!, 'F-2', addDays(today, -4));

    expect(await run()).toEqual({ overdue: 1, dueSoon: 1 });
    const typed = (type: 'InvoiceDueSoon' | 'InvoiceOverdue') =>
      events.flatMap((e) => (e.type === type ? [e.payload.invoiceId] : []));
    expect(typed('InvoiceDueSoon')).toEqual([onSoon]);
    expect(typed('InvoiceOverdue')).toEqual([offOverdue]);
    expect(await prisma.invoiceReminder.count({ where: { invoiceId: offSoon } })).toBe(0);
    expect(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: offOverdue } })).paymentStatus,
    ).toBe('overdue');

    // Idempotent while off; switching it on warns the invoice in the window once.
    expect(await run()).toEqual({ overdue: 0, dueSoon: 0 });
    await prisma.invoicingSettings.update({
      where: { cooperativeId: COOPS[1]! },
      data: { invoiceNoticeEnabled: true },
    });
    expect(await run()).toEqual({ overdue: 0, dueSoon: 1 });
    expect(typed('InvoiceDueSoon')).toEqual([onSoon, offSoon]);
    expect(await run()).toEqual({ overdue: 0, dueSoon: 0 });
  });

  it('NFR-INV-04: running it twice changes nothing and duplicates no notices', async () => {
    await invoice(COOPS[0]!, 'F-1', addDays(today, -1));
    await invoice(COOPS[0]!, 'F-2', addDays(today, 1));

    await run();
    const afterFirst = events.length;
    expect(await run()).toEqual({ overdue: 0, dueSoon: 0 });
    await Promise.all([run(), run()]);

    expect(events).toHaveLength(afterFirst);
    expect(await prisma.invoiceReminder.count()).toBe(2);
  });

  it('an invoice warned as due soon later receives its overdue notice', async () => {
    const id = await invoice(COOPS[0]!, 'F-1', addDays(today, 1));
    await run();
    await prisma.invoice.update({
      where: { id },
      data: { dueDate: new Date(`${addDays(today, -1)}T00:00:00Z`) },
    });

    await run();

    expect(events.map((e) => e.type)).toEqual(['InvoiceDueSoon', 'InvoiceOverdue']);
  });
});
