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
  it('marks as overdue the pending ones past due and warns about those due in 3 days, in all cooperatives', async () => {
    const overdueA = await invoice(COOPS[0]!, 'F-1', addDays(today, -1));
    const overdueB = await invoice(COOPS[1]!, 'F-1', addDays(today, -10));
    const soon = await invoice(COOPS[0]!, 'F-2', addDays(today, 2));
    const dueToday = await invoice(COOPS[0]!, 'F-3', today);
    await invoice(COOPS[0]!, 'F-4', addDays(today, 10));
    await invoice(COOPS[0]!, 'F-5', addDays(today, -5), 'settled');
    await invoice(COOPS[0]!, 'F-6', addDays(today, -5), 'voided');

    expect(await run()).toEqual({ overdue: 2, dueSoon: 2 });

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
