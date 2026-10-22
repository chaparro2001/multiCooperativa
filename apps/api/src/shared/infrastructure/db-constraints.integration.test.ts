import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../test/database';

const prisma = createTestPrisma();
const COOP = '90000000-0000-4000-8000-000000000001';
let invoiceId = '';
let noteId = '';

beforeAll(async () => {
  await resetDatabase(prisma);
  const thirdParty = await prisma.thirdParty.create({
    data: {
      cooperativeId: COOP,
      nif: 'B12345674',
      name: 'Supplier',
      isSupplier: true,
      isCustomer: false,
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      cooperativeId: COOP,
      thirdPartyId: thirdParty.id,
      operation: 'purchase',
      number: 'F-1',
      issueDate: new Date('2026-01-01T00:00:00Z'),
      dueDate: new Date('2026-02-01T00:00:00Z'),
      base: '100.00',
      vatRate: '21',
      total: '121.00',
      reconciliationStatus: 'no_delivery_notes',
    },
  });
  invoiceId = invoice.id;
  const note = await prisma.deliveryNote.create({
    data: {
      cooperativeId: COOP,
      thirdPartyId: thirdParty.id,
      operation: 'purchase',
      number: 'A-1',
      date: new Date('2026-01-01T00:00:00Z'),
    },
  });
  noteId = note.id;
});

afterAll(async () => {
  await resetDatabase(prisma);
  await prisma.$disconnect();
});

/** Copies the base invoice with other amounts, through raw SQL (the ORM would not skip the checks anyway). */
const insertInvoice = (number: string, base: string, vatRate: string, total: string) =>
  prisma.$executeRawUnsafe(
    `INSERT INTO "Invoice" (id, "cooperativeId", "thirdPartyId", operation, number, "issueDate", "dueDate", base, "vatRate", total, "reconciliationStatus")
     SELECT gen_random_uuid(), "cooperativeId", "thirdPartyId", operation, $1, "issueDate", "dueDate", $2::numeric, $3::numeric, $4::numeric, "reconciliationStatus"
     FROM "Invoice" WHERE id = $5::uuid`,
    number,
    base,
    vatRate,
    total,
    invoiceId,
  );

const id = () => randomUUID();

describe('database CHECK constraints (the same rules the domain enforces)', () => {
  it.each([
    [
      'AssemblySettings quorum above 100 %',
      `INSERT INTO "AssemblySettings" ("cooperativeId", "firstCallQuorumPercent") VALUES ('${id()}', 101)`,
      'AssemblySettings_quorum_percent_check',
    ],
    [
      'AssemblySettings reinforced denominator of zero',
      `INSERT INTO "AssemblySettings" ("cooperativeId", "reinforcedDenominator") VALUES ('${id()}', 0)`,
      'AssemblySettings_reinforced_check',
    ],
    [
      'AssemblySettings negative notice days',
      `INSERT INTO "AssemblySettings" ("cooperativeId", "minNoticeDays") VALUES ('${id()}', -1)`,
      'AssemblySettings_min_notice_days_check',
    ],
    [
      'Assembly second call before the first',
      `INSERT INTO "Assembly" (id, "cooperativeId", type, "firstCallAt", "secondCallAt", place) VALUES ('${id()}', '${COOP}', 'ordinary', '2026-06-01T10:00:00Z', '2026-06-01T09:00:00Z', 'Hall')`,
      'Assembly_second_call_after_first_check',
    ],
    [
      'InvoicingSettings tolerance above 100 %',
      `INSERT INTO "InvoicingSettings" ("cooperativeId", "toleranceBasisPoints") VALUES ('${id()}', 10001)`,
      'InvoicingSettings_tolerance_check',
    ],
    [
      'InvoicingSettings notice days out of range',
      `INSERT INTO "InvoicingSettings" ("cooperativeId", "invoiceNoticeDays") VALUES ('${id()}', 0)`,
      'InvoicingSettings_days_check',
    ],
    [
      'InvoicingSettings note notice not before the deadline',
      `INSERT INTO "InvoicingSettings" ("cooperativeId", "noteDeadlineDays", "noteNoticeDays") VALUES ('${id()}', 10, 10)`,
      'InvoicingSettings_note_notice_before_deadline_check',
    ],
    [
      'AssistantSetting unknown source',
      `INSERT INTO "AssistantSetting" ("cooperativeId", source) VALUES ('${id()}', 'cloud')`,
      'AssistantSetting_source_check',
    ],
  ])('rejects %s', async (_name, sql, constraint) => {
    await expect(prisma.$executeRawUnsafe(sql)).rejects.toThrow(constraint);
  });

  it.each([
    ['DeliveryNoteLine', 'deliveryNoteId', 'DeliveryNoteLine_quantity_check'],
    ['InvoiceLine', 'invoiceId', 'InvoiceLine_quantity_check'],
  ])('BR-INV-02 rejects a %s with zero quantity', async (table, column, constraint) => {
    const parent = table === 'InvoiceLine' ? invoiceId : noteId;
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "${table}" (id, "${column}", position, concept, quantity, unit) VALUES (gen_random_uuid(), '${parent}', 1, 'Olives', 0, 'kg')`,
      ),
    ).rejects.toThrow(constraint);
  });

  it.each([
    ['VAT rate above 100', '100.00', '101', '201.00', 'Invoice_vat_rate_check'],
    ['total that is not base plus VAT', '100.00', '21', '125.00', 'Invoice_total_check'],
  ])('BR-INV-07 rejects an invoice with %s', async (_name, base, vat, total, constraint) => {
    await expect(insertInvoice('F-bad', base, vat, total)).rejects.toThrow(constraint);
  });

  it('BR-INV-07 keeps allowing credit notes (negative amounts that balance) and the 0.01 tolerance', async () => {
    await expect(insertInvoice('F-credit', '-100.00', '21', '-121.00')).resolves.toBe(1);
    await expect(insertInvoice('F-round', '10.10', '21', '12.22')).resolves.toBe(1);
  });
});
