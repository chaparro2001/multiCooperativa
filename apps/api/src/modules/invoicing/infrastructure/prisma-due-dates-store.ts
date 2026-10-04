import type { PrismaClient } from '../../../shared/infrastructure/prisma';
import type { DueDatesStore, DueInvoice } from '../application/ports/due-dates-store';

type Row = Omit<DueInvoice, 'dueDate'> & { dueDate: Date };
const toDue = (row: Row): DueInvoice => ({
  ...row,
  dueDate: row.dueDate.toISOString().slice(0, 10),
});

/** Set-based SQL: the same rules as `markOverdue` and `isDueSoon` of the domain. */
export class PrismaDueDatesStore implements DueDatesStore {
  constructor(private readonly prisma: PrismaClient) {}

  markOverdue(today: string): Promise<DueInvoice[]> {
    return this.prisma.$transaction(async (tx) => {
      // RETURNING gives only the rows that actually changed now.
      const changed = await tx.$queryRaw<Row[]>`
        UPDATE "Invoice" SET "paymentStatus" = 'vencida'
        WHERE "paymentStatus" = 'pendiente' AND "dueDate" < ${today}::date
        RETURNING id AS "invoiceId", "cooperativeId", "thirdPartyId", operation::text AS operation, "dueDate"`;
      if (changed.length > 0) {
        await tx.invoiceReminder.createMany({
          data: changed.map((row) => ({
            invoiceId: row.invoiceId,
            kind: 'vencida',
            sentOn: new Date(`${today}T00:00:00Z`),
          })),
          skipDuplicates: true,
        });
      }
      return changed.map(toDue);
    });
  }

  async claimDueSoon(from: string, until: string): Promise<DueInvoice[]> {
    // The insert is the claim: a second run finds the reminder and returns nothing.
    const claimed = await this.prisma.$queryRaw<Row[]>`
      WITH claimed AS (
        INSERT INTO "InvoiceReminder" ("invoiceId", kind, "sentOn")
        SELECT id, 'proxima_a_vencer', ${from}::date FROM "Invoice"
        WHERE "paymentStatus" = 'pendiente' AND "dueDate" BETWEEN ${from}::date AND ${until}::date
        ON CONFLICT DO NOTHING
        RETURNING "invoiceId"
      )
      SELECT i.id AS "invoiceId", i."cooperativeId", i."thirdPartyId", i.operation::text AS operation, i."dueDate"
      FROM "Invoice" i JOIN claimed c ON c."invoiceId" = i.id`;
    return claimed.map(toDue);
  }
}
