import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import type { CooperativeContext } from '../../access';
import { createInvoicingReads } from '../application/assistant-reads';
import { PrismaAssistantQueries } from './prisma-assistant-queries';
import { PrismaDeliveryNoteStore, PrismaInvoiceStore } from './prisma-document-stores';
import { PrismaThirdPartyStore } from './prisma-third-party-store';

const prisma = createTestPrisma();
const COOP_A = '40000000-0000-4000-8000-0000000000a1';
const COOP_B = '40000000-0000-4000-8000-0000000000b2';
const TODAY = '2026-10-20';

const contextFor = (cooperativeId: string, permissions: { module: string; level: string }[]) =>
  ({
    userId: 'u',
    sessionId: 's',
    cooperativeId,
    membershipId: 'm',
    profileName: 'p',
    isPartner: false,
    permissions: permissions.map((p) => ({ ...p, scope: 'all' })),
  }) as unknown as CooperativeContext;
const reader = (cooperativeId = COOP_A) =>
  contextFor(cooperativeId, [{ module: 'invoicing', level: 'read' }]);

const thirdParties = new PrismaThirdPartyStore(prisma);
const reads = createInvoicingReads({
  thirdParties,
  deliveryNotes: new PrismaDeliveryNoteStore(prisma),
  invoices: new PrismaInvoiceStore(prisma),
  assistantQueries: new PrismaAssistantQueries(prisma),
  today: () => TODAY,
} as unknown as Parameters<typeof createInvoicingReads>[0]);

const ids: Record<string, string> = {};

async function party(cooperativeId: string, key: string, nif: string, name: string) {
  const row = await prisma.thirdParty.create({
    data: { cooperativeId, nif, name, isSupplier: true, isCustomer: key === 'customer' },
  });
  ids[key] = row.id;
}

async function invoice(
  key: string,
  extra: {
    cooperativeId?: string;
    operation?: 'purchase' | 'sale';
    number: string;
    issueDate: string;
    dueDate?: string;
    base: string;
    total: string;
    paymentStatus?: 'pending' | 'overdue' | 'settled' | 'voided';
    settledAt?: string;
    reconciliation?: 'no_delivery_notes' | 'reconciled' | 'with_discrepancy';
    lines?: { concept: string; quantity: string; unit: string }[];
  },
) {
  return prisma.invoice.create({
    data: {
      cooperativeId: extra.cooperativeId ?? COOP_A,
      thirdPartyId: ids[key]!,
      operation: extra.operation ?? 'purchase',
      number: extra.number,
      issueDate: new Date(`${extra.issueDate}T00:00:00Z`),
      dueDate: new Date(`${extra.dueDate ?? extra.issueDate}T00:00:00Z`),
      base: extra.base,
      vatRate: '21',
      total: extra.total,
      paymentStatus: extra.paymentStatus ?? 'pending',
      settledAt: extra.settledAt ? new Date(`${extra.settledAt}T00:00:00Z`) : null,
      reconciliationStatus: extra.reconciliation ?? 'no_delivery_notes',
      lines: { create: (extra.lines ?? []).map((l, i) => ({ position: i + 1, ...l })) },
    },
  });
}

async function note(
  key: string,
  number: string,
  date: string,
  lines: { concept: string; quantity: string; unit: string }[],
  extra: { cooperativeId?: string; status?: 'pending_invoicing' | 'invoiced' | 'voided' } = {},
) {
  return prisma.deliveryNote.create({
    data: {
      cooperativeId: extra.cooperativeId ?? COOP_A,
      thirdPartyId: ids[key]!,
      operation: 'purchase',
      number,
      date: new Date(`${date}T00:00:00Z`),
      status: extra.status ?? 'pending_invoicing',
      lines: { create: lines.map((l, i) => ({ position: i + 1, ...l })) },
    },
  });
}

beforeEach(async () => {
  await resetDatabase(prisma);
  await party(COOP_A, 'south', 'B12345674', 'Southern Fertilizers');
  await party(COOP_A, 'agro', 'B98765432', 'Agrotools');
  await party(COOP_A, 'customer', 'F11223344', 'Bodegas Sol');
  await party(COOP_A, 'quiet', 'A58818501', 'Quiet Supplier');
  await party(COOP_B, 'other', 'B11111111', 'Other Coop Supplier');

  await invoice('south', {
    number: 'F-1',
    issueDate: '2026-01-10',
    base: '100.10',
    total: '121.12',
  });
  await invoice('south', {
    number: 'F-2',
    issueDate: '2026-02-10',
    base: '200.20',
    total: '242.24',
    paymentStatus: 'settled',
    settledAt: '2026-03-05',
  });
  await invoice('agro', {
    number: 'F-3',
    issueDate: '2026-02-15',
    dueDate: '2026-03-15',
    base: '1000.00',
    total: '1210.00',
    paymentStatus: 'overdue',
    reconciliation: 'with_discrepancy',
  });
  await invoice('agro', {
    number: 'F-VOID',
    issueDate: '2026-02-16',
    base: '5000.00',
    total: '6050.00',
    paymentStatus: 'voided',
  });
  await invoice('customer', {
    operation: 'sale',
    number: 'V-1',
    issueDate: '2026-02-20',
    dueDate: '2026-11-01',
    base: '400.00',
    total: '484.00',
  });
  await invoice('other', {
    cooperativeId: COOP_B,
    number: 'F-OTHER',
    issueDate: '2026-02-20',
    base: '9999.00',
    total: '12098.79',
  });
});
afterAll(() => prisma.$disconnect());

describe('US-AI-08 · invoice_totals (integration)', () => {
  it('US-AI-08: adds base, VAT and total exactly, leaving voided invoices and other cooperatives out', async () => {
    const result = await reads.invoiceTotals(reader(), { groupBy: 'none', limit: 10 });

    expect(result.overall).toEqual({
      count: 4,
      base: '1700.30',
      vatAmount: '357.06',
      total: '2057.36',
    });
    expect(result.groups).toEqual([]);
  });

  it('US-AI-08: ranks third parties by total, highest first, and reports how many there are', async () => {
    const result = await reads.invoiceTotals(reader(), {
      operation: 'purchase',
      from: '2026-01-01',
      to: '2026-12-31',
      groupBy: 'third_party',
      limit: 1,
    });

    expect(result.groups.map((g) => [g.label, g.total, g.count])).toEqual([
      ['Agrotools', '1210.00', 1],
    ]);
    expect(result.groupCount).toBe(2);
    expect(result.overall.total).toBe('1573.36');
  });

  it('US-AI-08: groups by month, oldest first', async () => {
    const result = await reads.invoiceTotals(reader(), {
      operation: 'purchase',
      groupBy: 'month',
      limit: 12,
    });

    expect(result.groups.map((g) => [g.key, g.total])).toEqual([
      ['2026-01', '121.12'],
      ['2026-02', '1452.24'],
    ]);
  });

  it('US-AI-08: filters by settlement date and groups months by it', async () => {
    const result = await reads.invoiceTotals(reader(), {
      settledFrom: '2026-03-01',
      settledTo: '2026-03-31',
      groupBy: 'month',
      limit: 12,
    });

    expect(result.overall).toMatchObject({ count: 1, total: '242.24' });
    expect(result.groups.map((g) => g.key)).toEqual(['2026-03']);
  });

  it('US-AI-08: the status filter can ask for voided ones', async () => {
    const result = await reads.invoiceTotals(reader(), {
      status: 'voided',
      groupBy: 'none',
      limit: 1,
    });

    expect(result.overall.total).toBe('6050.00');
  });

  it('US-AI-08: the third party text matches name or NIF and is searched literally', async () => {
    const byName = await reads.invoiceTotals(reader(), {
      thirdParty: 'southern',
      groupBy: 'none',
      limit: 1,
    });
    const byNif = await reads.invoiceTotals(reader(), {
      thirdParty: 'B98765432',
      groupBy: 'none',
      limit: 1,
    });
    const wildcard = await reads.invoiceTotals(reader(), {
      thirdParty: '%',
      groupBy: 'none',
      limit: 1,
    });

    expect(byName.overall.count).toBe(2);
    expect(byNif.overall.count).toBe(1);
    expect(wildcard.overall.count).toBe(0);
  });

  it('BR-INV-01: never adds up another cooperative', async () => {
    const other = await reads.invoiceTotals(reader(COOP_B), { groupBy: 'third_party', limit: 5 });

    expect(other.groups.map((g) => g.label)).toEqual(['Other Coop Supplier']);
    expect(other.overall.total).toBe('12098.79');
  });

  it('US-AI-03: without invoicing read the reads are denied', async () => {
    const member = contextFor(COOP_A, [{ module: 'announcements', level: 'read' }]);

    await expect(reads.invoiceTotals(member, { groupBy: 'none', limit: 1 })).rejects.toThrow();
    await expect(reads.cashForecast(member, { granularity: 'week' })).rejects.toThrow();
    await expect(
      reads.topItems(member, { source: 'delivery_notes', groupBy: 'none', limit: 5 }),
    ).rejects.toThrow();
    await expect(reads.thirdPartySummary(member, 'south')).rejects.toThrow();
    await expect(reads.openDiscrepancies(member, {})).rejects.toThrow();
  });
});

describe('US-AI-08 · lists, details and discrepancies (integration)', () => {
  it('US-AI-08: list_invoices carries base, VAT rate and settlement, and filters by settlement date', async () => {
    const result = await reads.invoices(reader(), {
      settledFrom: '2026-03-01',
      settledTo: '2026-03-31',
    });

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      number: 'F-2',
      base: '200.20',
      vatRate: '21',
      settledAt: '2026-03-05',
    });
  });

  it('US-AI-08: invoice_detail finds the number ignoring case, with lines and delivery notes', async () => {
    const created = await invoice('south', {
      number: 'F-DET',
      issueDate: '2026-04-01',
      base: '100.00',
      total: '121.00',
      reconciliation: 'with_discrepancy',
      lines: [{ concept: 'Fertilizante', quantity: '1250', unit: 'kg' }],
    });
    const delivered = await note('south', 'A-9', '2026-03-30', [
      { concept: 'Fertilizante', quantity: '1200', unit: 'kg' },
    ]);
    await prisma.deliveryNote.update({
      where: { id: delivered.id },
      data: { invoiceId: created.id, status: 'invoiced' },
    });
    await prisma.discrepancy.create({
      data: {
        invoiceId: created.id,
        concept: 'Fertilizante',
        unit: 'kg',
        deliveredQuantity: '1200',
        invoicedQuantity: '1250',
        explanation: 'Se facturaron 50 kg de más.',
      },
    });

    const result = await reads.invoiceDetail(reader(), { number: 'f-det' });

    expect(result.total).toBe(1);
    expect(result.rows[0]).toMatchObject({
      number: 'F-DET',
      vatAmount: '21.00',
      lines: [{ concept: 'Fertilizante', quantity: '1250', unit: 'kg' }],
      deliveryNotes: [{ number: 'A-9', date: '2026-03-30' }],
      discrepancies: [
        {
          deliveredQuantity: '1200',
          invoicedQuantity: '1250',
          difference: '50',
          explanation: 'Se facturaron 50 kg de más.',
        },
      ],
    });
  });

  it("US-AI-08: invoice_detail does not find another cooperative's invoice", async () => {
    const result = await reads.invoiceDetail(reader(), { number: 'F-OTHER' });

    expect(result).toEqual({ rows: [], total: 0 });
  });

  it('US-AI-08: open discrepancies are the ones still to pay or collect, most urgent first', async () => {
    await invoice('south', {
      number: 'F-SETTLED-DISC',
      issueDate: '2026-04-01',
      base: '10.00',
      total: '12.10',
      paymentStatus: 'settled',
      settledAt: '2026-04-10',
      reconciliation: 'with_discrepancy',
    });

    const result = await reads.openDiscrepancies(reader(), {});

    expect(result.rows.map((row) => row.number)).toEqual(['F-3']);
  });

  it('US-AI-08: pending delivery notes come with their age and oldest first', async () => {
    await note('south', 'A-NEW', '2026-10-15', [{ concept: 'Abono', quantity: '1', unit: 'kg' }]);
    await note('south', 'A-OLD', '2026-09-20', [{ concept: 'Abono', quantity: '1', unit: 'kg' }]);
    await note('south', 'A-DONE', '2026-08-01', [{ concept: 'Abono', quantity: '1', unit: 'kg' }], {
      status: 'invoiced',
    });

    const result = await reads.deliveryNotes(reader(), {
      status: 'pending_invoicing',
      sort: 'oldest_first',
    });

    expect(result.rows.map((row) => [row.number, row.ageDays])).toEqual([
      ['A-OLD', 30],
      ['A-NEW', 5],
    ]);
    const all = await reads.deliveryNotes(reader(), {});
    expect(all.rows.find((row) => row.number === 'A-DONE')?.ageDays).toBeUndefined();
  });
});

describe('US-AI-08 · cash_forecast and top_items (integration)', () => {
  it('US-AI-08: buckets pending and overdue invoices by due week, keeping payments and collections apart', async () => {
    await invoice('south', {
      number: 'F-W1',
      issueDate: '2026-10-01',
      dueDate: '2026-10-22',
      base: '100.00',
      total: '121.00',
    });
    await invoice('customer', {
      operation: 'sale',
      number: 'V-W2',
      issueDate: '2026-10-01',
      dueDate: '2026-10-28',
      base: '10.00',
      total: '12.10',
    });

    const result = await reads.cashForecast(reader(), {
      dueFrom: '2026-10-01',
      dueTo: '2026-12-31',
      granularity: 'week',
    });

    expect(result.buckets.map((b) => [b.from, b.toPay.total, b.toCollect.total])).toEqual([
      ['2026-10-19', '121.00', '0.00'],
      ['2026-10-26', '0.00', '496.10'],
    ]);
    expect(result.overall.toCollect.total).toBe('496.10');
  });

  it('US-AI-08: without a range it includes overdue ones and keeps their part apart', async () => {
    const result = await reads.cashForecast(reader(), {
      granularity: 'month',
      operation: 'purchase',
    });

    const march = result.buckets.find((b) => b.from === '2026-03-01');
    expect(march?.toPay).toMatchObject({
      total: '1210.00',
      overdueTotal: '1210.00',
      overdueCount: 1,
    });
    expect(result.overall.toPay.total).toBe('1331.12');
  });

  it('US-AI-08: top_items adds spellings together, per unit, leaving voided notes and other cooperatives out', async () => {
    await note('south', 'A-1', '2026-02-01', [
      { concept: 'Aceite de oliva', quantity: '100', unit: 'l' },
      { concept: 'Abono NPK', quantity: '900', unit: 'kg' },
    ]);
    await note('south', 'A-2', '2026-03-01', [
      { concept: 'aceite  de OLIVA', quantity: '250.5', unit: 'l' },
    ]);
    await note('agro', 'A-3', '2026-03-02', [
      { concept: 'Aceite de oliva', quantity: '50', unit: 'L' },
    ]);
    await note(
      'south',
      'A-VOID',
      '2026-03-03',
      [{ concept: 'Abono NPK', quantity: '9999', unit: 'kg' }],
      {
        status: 'voided',
      },
    );
    await note(
      'other',
      'A-OTHER',
      '2026-03-03',
      [{ concept: 'Abono NPK', quantity: '7777', unit: 'kg' }],
      {
        cooperativeId: COOP_B,
      },
    );

    const top = await reads.topItems(reader(), {
      source: 'delivery_notes',
      groupBy: 'none',
      limit: 10,
    });
    expect(top.rows.map((r) => [r.concept, r.unit, r.quantity])).toEqual([
      ['Abono NPK', 'kg', '900'],
      ['Aceite de oliva', 'l', '400.5'],
    ]);

    const evolution = await reads.topItems(reader(), {
      source: 'delivery_notes',
      concept: 'ACEITE',
      groupBy: 'month',
      limit: 5,
    });
    expect(evolution.rows.map((r) => [r.period, r.quantity])).toEqual([
      ['2026-02', '100'],
      ['2026-03', '300.5'],
    ]);

    const ranged = await reads.topItems(reader(), {
      source: 'delivery_notes',
      from: '2026-03-01',
      groupBy: 'none',
      limit: 10,
    });
    expect(ranged.rows.map((r) => r.concept)).toEqual(['Aceite de oliva']);
  });

  it('US-AI-08: top_items can read invoice lines', async () => {
    await invoice('south', {
      number: 'F-L',
      issueDate: '2026-05-01',
      base: '10.00',
      total: '12.10',
      lines: [{ concept: 'Semilla', quantity: '30', unit: 'kg' }],
    });

    const top = await reads.topItems(reader(), { source: 'invoices', groupBy: 'none', limit: 5 });

    expect(top.rows).toEqual([{ concept: 'Semilla', unit: 'kg', quantity: '30', lines: 1 }]);
  });
});

describe('US-AI-08 · third-party summary (find_third_party) and inactive third parties (integration)', () => {
  it('US-AI-08: summarizes balance, last documents and the year of one third party', async () => {
    await note('south', 'A-1', '2026-06-01', [{ concept: 'Abono', quantity: '1', unit: 'kg' }]);

    const { summary, candidates } = await reads.thirdPartySummary(reader(), 'Southern');

    expect(candidates).toHaveLength(1);
    expect(summary).toMatchObject({
      name: 'Southern Fertilizers',
      toPay: { pending: '121.12', overdue: '0.00', pendingCount: 1 },
      lastDeliveryNote: { number: 'A-1', date: '2026-06-01' },
      lastInvoice: { number: 'F-2', issueDate: '2026-02-10' },
      year: '2026',
      thisYear: { purchases: { invoices: 2, invoicedTotal: '363.36', deliveryNotes: 1 } },
    });
  });

  it('US-AI-08: an ambiguous text gives the candidates and no summary', async () => {
    const { summary, candidates } = await reads.thirdPartySummary(reader(), 'o');

    expect(summary).toBeNull();
    expect(candidates.length).toBeGreaterThan(1);
  });

  it('US-AI-08: by NIF finds exactly one', async () => {
    const { summary } = await reads.thirdPartySummary(reader(), 'b98765432');

    expect(summary?.name).toBe('Agrotools');
  });

  it('US-AI-08: inactive_since lists active third parties with nothing since the date, longest quiet first', async () => {
    await note('quiet', 'A-Q', '2026-01-05', [{ concept: 'Abono', quantity: '1', unit: 'kg' }]);
    await note('south', 'A-S', '2026-09-15', [{ concept: 'Abono', quantity: '1', unit: 'kg' }]);

    const result = await reads.listThirdParties(reader(), { inactiveSince: '2026-06-01' });

    // Agrotools last invoiced 2026-02-16 (voided one does not count) -> 2026-02-15; Bodegas Sol 2026-02-20.
    expect(result.rows.map((r) => [r.name, r.lastActivity])).toEqual([
      ['Quiet Supplier', '2026-01-05'],
      ['Agrotools', '2026-02-15'],
      ['Bodegas Sol', '2026-02-20'],
    ]);
    const suppliers = await reads.listThirdParties(reader(), {
      inactiveSince: '2026-06-01',
      type: 'customer',
      limit: 1,
    });
    expect(suppliers.rows.map((r) => r.name)).toEqual(['Bodegas Sol']);
    expect(result.rows.map((r) => r.name)).not.toContain('Other Coop Supplier');
  });

  it('US-AI-08: lists report the total when the limit cuts them', async () => {
    const result = await reads.listThirdParties(reader(), { limit: 2 });

    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(4);
  });
});
