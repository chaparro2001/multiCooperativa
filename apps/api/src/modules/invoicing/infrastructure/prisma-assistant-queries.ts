import { Prisma, type PrismaClient } from '../../../shared/infrastructure/prisma';
import type {
  AssistantQueries,
  InvoiceTotalsFilter,
  PartyActivity,
  TotalsGroup,
  TotalsGroupBy,
} from '../application/ports/assistant-queries';
import { parseMoney, parseQuantity } from '../domain/money';
import type { Operation } from '../domain/documents';

type DecimalLike = { toFixed(digits: number): string };
const day = (date: Date) => date.toISOString().slice(0, 10);
const fromDay = (value: string) => new Date(`${value}T00:00:00Z`);

/** Escapes LIKE wildcards so the text is searched literally. */
const likeOf = (text: string) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function totalsWhere(cooperativeId: string, filter: InvoiceTotalsFilter): Prisma.Sql {
  const conditions = [Prisma.sql`i."cooperativeId" = ${cooperativeId}::uuid`];
  if (filter.operation)
    conditions.push(Prisma.sql`i."operation" = ${filter.operation}::"Operation"`);
  if (filter.paymentStatus) {
    conditions.push(Prisma.sql`i."paymentStatus" = ${filter.paymentStatus}::"PaymentStatus"`);
  } else {
    conditions.push(Prisma.sql`i."paymentStatus" <> 'voided'`);
  }
  if (filter.from) conditions.push(Prisma.sql`i."issueDate" >= ${filter.from}::date`);
  if (filter.to) conditions.push(Prisma.sql`i."issueDate" <= ${filter.to}::date`);
  if (filter.settledFrom) conditions.push(Prisma.sql`i."settledAt" >= ${filter.settledFrom}::date`);
  if (filter.settledTo) conditions.push(Prisma.sql`i."settledAt" <= ${filter.settledTo}::date`);
  if (filter.thirdPartyId)
    conditions.push(Prisma.sql`i."thirdPartyId" = ${filter.thirdPartyId}::uuid`);
  if (filter.thirdParty) {
    const like = likeOf(filter.thirdParty);
    conditions.push(Prisma.sql`(tp."name" ILIKE ${like} OR tp."nif" ILIKE ${like})`);
  }
  return Prisma.join(conditions, ' AND ');
}

interface TotalsRow {
  key: string | null;
  label: string | null;
  count: number;
  base: string;
  total: string;
  groups: number;
}

export class PrismaAssistantQueries implements AssistantQueries {
  constructor(private readonly prisma: PrismaClient) {}

  async invoiceTotals(
    cooperativeId: string,
    filter: InvoiceTotalsFilter,
    options: { groupBy: TotalsGroupBy; limit: number },
  ) {
    const where = totalsWhere(cooperativeId, filter);
    // Month of the settlement when the question is about settlements, of the invoice otherwise.
    const monthOf =
      filter.settledFrom || filter.settledTo
        ? Prisma.sql`i."settledAt"`
        : Prisma.sql`i."issueDate"`;
    const grouping: Record<
      TotalsGroupBy,
      { select: Prisma.Sql; group: Prisma.Sql; order: Prisma.Sql }
    > = {
      none: {
        select: Prisma.sql`NULL::text AS key, NULL::text AS label`,
        group: Prisma.empty,
        order: Prisma.empty,
      },
      third_party: {
        select: Prisma.sql`tp."id"::text AS key, tp."name" AS label`,
        group: Prisma.sql`GROUP BY tp."id", tp."name"`,
        order: Prisma.sql`ORDER BY SUM(i."total") DESC, tp."name" ASC, tp."id" ASC`,
      },
      month: {
        select: Prisma.sql`to_char(${monthOf}, 'YYYY-MM') AS key, NULL::text AS label`,
        group: Prisma.sql`GROUP BY to_char(${monthOf}, 'YYYY-MM')`,
        order: Prisma.sql`ORDER BY key ASC`,
      },
    };
    const { select, group, order } = grouping[options.groupBy];
    const rows = await this.prisma.$queryRaw<TotalsRow[]>`
      SELECT ${select},
             COUNT(*)::int AS count,
             COALESCE(SUM(i."base"), 0)::text AS base,
             COALESCE(SUM(i."total"), 0)::text AS total,
             COUNT(*) OVER ()::int AS groups
      FROM "Invoice" i
      JOIN "ThirdParty" tp ON tp."id" = i."thirdPartyId"
      WHERE ${where}
      ${group}
      ${order}
      LIMIT ${options.limit}`;
    const groups = options.groupBy === 'none' ? 1 : (rows[0]?.groups ?? 0);
    return {
      groups,
      rows: rows.map((row): TotalsGroup => ({
        key: row.key,
        label: row.label,
        count: row.count,
        base: parseMoney(row.base),
        total: parseMoney(row.total),
      })),
    };
  }

  async dueInvoices(
    cooperativeId: string,
    filter: { operation?: Operation; dueFrom?: string; dueTo?: string },
  ) {
    const rows = await this.prisma.invoice.findMany({
      where: {
        cooperativeId,
        paymentStatus: { in: ['pending', 'overdue'] },
        ...(filter.operation && { operation: filter.operation }),
        ...((filter.dueFrom || filter.dueTo) && {
          dueDate: {
            ...(filter.dueFrom && { gte: fromDay(filter.dueFrom) }),
            ...(filter.dueTo && { lte: fromDay(filter.dueTo) }),
          },
        }),
      },
      select: { operation: true, dueDate: true, total: true, paymentStatus: true },
    });
    return rows.map((row) => ({
      operation: row.operation,
      dueDate: day(row.dueDate),
      total: parseMoney((row.total as DecimalLike).toFixed(2)),
      overdue: row.paymentStatus === 'overdue',
    }));
  }

  async itemLines(
    cooperativeId: string,
    filter: {
      source: 'delivery_notes' | 'invoices';
      operation?: Operation;
      from?: string;
      to?: string;
    },
  ) {
    const range = (field: string) =>
      filter.from || filter.to
        ? {
            [field]: {
              ...(filter.from && { gte: fromDay(filter.from) }),
              ...(filter.to && { lte: fromDay(filter.to) }),
            },
          }
        : {};
    const parent = {
      cooperativeId,
      ...(filter.operation && { operation: filter.operation }),
    };
    if (filter.source === 'delivery_notes') {
      const rows = await this.prisma.deliveryNoteLine.findMany({
        where: { deliveryNote: { ...parent, status: { not: 'voided' }, ...range('date') } },
        select: {
          concept: true,
          unit: true,
          quantity: true,
          deliveryNote: { select: { date: true } },
        },
      });
      return rows.map((row) => ({
        date: day(row.deliveryNote.date),
        concept: row.concept,
        unit: row.unit,
        quantity: parseQuantity((row.quantity as DecimalLike).toFixed(3)),
      }));
    }
    const rows = await this.prisma.invoiceLine.findMany({
      where: { invoice: { ...parent, paymentStatus: { not: 'voided' }, ...range('issueDate') } },
      select: {
        concept: true,
        unit: true,
        quantity: true,
        invoice: { select: { issueDate: true } },
      },
    });
    return rows.map((row) => ({
      date: day(row.invoice.issueDate),
      concept: row.concept,
      unit: row.unit,
      quantity: parseQuantity((row.quantity as DecimalLike).toFixed(3)),
    }));
  }

  async partyActivity(
    cooperativeId: string,
    thirdPartyId: string,
    range: { from: string; to: string },
  ): Promise<PartyActivity> {
    const where = { cooperativeId, thirdPartyId };
    const [note, invoice, inRange] = await Promise.all([
      this.prisma.deliveryNote.findFirst({
        where: { ...where, status: { not: 'voided' } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        select: { number: true, date: true, operation: true },
      }),
      this.prisma.invoice.findFirst({
        where: { ...where, paymentStatus: { not: 'voided' } },
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        select: { number: true, issueDate: true, operation: true },
      }),
      this.prisma.deliveryNote.groupBy({
        by: ['operation'],
        where: {
          ...where,
          status: { not: 'voided' },
          date: { gte: fromDay(range.from), lte: fromDay(range.to) },
        },
        _count: true,
      }),
    ]);
    const count = (operation: Operation) =>
      inRange.find((group) => group.operation === operation)?._count ?? 0;
    return {
      lastDeliveryNote: note && {
        number: note.number,
        date: day(note.date),
        operation: note.operation,
      },
      lastInvoice: invoice && {
        number: invoice.number,
        issueDate: day(invoice.issueDate),
        operation: invoice.operation,
      },
      deliveryNotesInRange: { purchase: count('purchase'), sale: count('sale') },
    };
  }

  async inactiveParties(
    cooperativeId: string,
    filter: { since: string; role?: 'supplier' | 'customer' },
  ) {
    const since = fromDay(filter.since);
    const rows = await this.prisma.thirdParty.findMany({
      where: {
        cooperativeId,
        active: true,
        ...(filter.role === 'supplier' && { isSupplier: true }),
        ...(filter.role === 'customer' && { isCustomer: true }),
        deliveryNotes: { none: { date: { gte: since }, status: { not: 'voided' } } },
        invoices: { none: { issueDate: { gte: since }, paymentStatus: { not: 'voided' } } },
      },
      select: {
        id: true,
        name: true,
        nif: true,
        isSupplier: true,
        isCustomer: true,
        createdAt: true,
        deliveryNotes: {
          where: { status: { not: 'voided' } },
          orderBy: { date: 'desc' },
          take: 1,
          select: { date: true },
        },
        invoices: {
          where: { paymentStatus: { not: 'voided' } },
          orderBy: { issueDate: 'desc' },
          take: 1,
          select: { issueDate: true },
        },
      },
    });
    return rows.map(({ deliveryNotes, invoices, ...party }) => {
      const dates = [
        deliveryNotes[0] && day(deliveryNotes[0].date),
        invoices[0] && day(invoices[0].issueDate),
      ]
        .filter((d): d is string => Boolean(d))
        .sort();
      return { ...party, lastActivity: dates.at(-1) ?? null };
    });
  }
}
