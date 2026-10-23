import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import type { CooperativeContext } from '../../access';
import { createInvoicingReads } from '../application/assistant-reads';
import { PrismaAssistantQueries } from './prisma-assistant-queries';
import { PrismaInvoiceStore } from './prisma-document-stores';
import { PrismaThirdPartyStore } from './prisma-third-party-store';

const prisma = createTestPrisma();
const COOP_A = '40000000-0000-4000-8000-000000000001';
const COOP_B = '40000000-0000-4000-8000-000000000002';
const NIF = '12345678Z';

const context = (cooperativeId: string, level: 'read' | 'manage' | null) =>
  ({
    userId: 'u',
    sessionId: 's',
    cooperativeId,
    membershipId: 'm',
    profileName: 'p',
    isPartner: false,
    permissions: level ? [{ module: 'invoicing', level, scope: 'all' }] : [],
  }) as unknown as CooperativeContext;

const reads = createInvoicingReads({
  thirdParties: new PrismaThirdPartyStore(prisma),
  invoices: new PrismaInvoiceStore(prisma),
  assistantQueries: new PrismaAssistantQueries(prisma),
} as unknown as Parameters<typeof createInvoicingReads>[0]);

async function party(cooperativeId: string, nif: string, name: string, isSupplier = true) {
  return prisma.thirdParty.create({
    data: { cooperativeId, nif, name, isSupplier, isCustomer: !isSupplier },
  });
}

async function invoice(
  cooperativeId: string,
  thirdPartyId: string,
  operation: 'purchase' | 'sale',
  number: string,
  issueDate: string,
  total: string,
  paymentStatus: 'pending' | 'voided' = 'pending',
) {
  await prisma.invoice.create({
    data: {
      cooperativeId,
      thirdPartyId,
      operation,
      number,
      issueDate: new Date(`${issueDate}T00:00:00Z`),
      dueDate: new Date(`${issueDate}T00:00:00Z`),
      base: total,
      vatRate: '0',
      total,
      paymentStatus,
      reconciliationStatus: 'no_delivery_notes',
    },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.cooperative.createMany({
    data: [
      { id: COOP_A, name: 'A', cif: 'F12345674' },
      { id: COOP_B, name: 'B', cif: 'F76543214' },
    ],
  });
  const luis = await party(COOP_A, NIF, 'Luis Martín');
  const stranger = await party(COOP_A, 'B12345674', 'Not a partner');
  const luisInB = await party(COOP_B, NIF, 'Luis in B');
  await invoice(COOP_A, luis.id, 'purchase', 'P-1', '2026-02-01', '1000.10');
  await invoice(COOP_A, luis.id, 'purchase', 'P-2', '2026-03-01', '0.20');
  await invoice(COOP_A, luis.id, 'purchase', 'P-OLD', '2025-03-01', '77.00');
  await invoice(COOP_A, luis.id, 'purchase', 'P-VOID', '2026-04-01', '500.00', 'voided');
  await invoice(COOP_A, luis.id, 'sale', 'S-1', '2026-05-01', '50.00');
  await invoice(COOP_A, stranger.id, 'purchase', 'P-3', '2026-02-01', '999.00');
  await invoice(COOP_B, luisInB.id, 'purchase', 'P-B', '2026-02-01', '12345.00');
});
afterAll(() => prisma.$disconnect());

describe('ADR-025 · tradeByNif read (integration)', () => {
  it('sums purchases and sales per partner NIF in the period with exact decimals, voided left out', async () => {
    const [trade, ...rest] = await reads.tradeByNif(context(COOP_A, 'read'), [NIF], {
      from: '2026-01-01',
      to: '2026-12-31',
    });

    expect(rest).toEqual([]);
    expect(trade).toMatchObject({
      nif: NIF,
      name: 'Luis Martín',
      supplier: true,
      purchases: { total: '1000.30', count: 2 },
      sales: { total: '50.00', count: 1 },
    });
  });

  it('without a period it sums every non-voided invoice', async () => {
    const [trade] = await reads.tradeByNif(context(COOP_A, 'read'), [NIF], {});

    expect(trade!.purchases).toEqual({ total: '1077.30', count: 3 });
  });

  it('BR-INV-01: never reads another cooperative; unknown NIFs give nothing', async () => {
    expect(await reads.tradeByNif(context(COOP_A, 'read'), ['X1234567L'], {})).toEqual([]);
    const [trade] = await reads.tradeByNif(context(COOP_B, 'read'), [NIF], {});
    expect(trade!.name).toBe('Luis in B');
    expect(trade!.purchases.total).toBe('12345.00');
  });

  it('denies a profile without invoicing', async () => {
    await expect(reads.tradeByNif(context(COOP_A, null), [NIF], {})).rejects.toThrow();
  });
});
