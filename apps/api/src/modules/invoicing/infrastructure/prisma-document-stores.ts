import type { Prisma, PrismaClient } from '../../../shared/infrastructure/prisma';
import type { PageRequest } from '../../../shared/pagination';
import { type DeliveryNoteState, type InvoiceState, type Line } from '../domain/documents';
import {
  DEFAULT_INVOICING_NOTICE_SETTINGS,
  type InvoicingNoticeSettings,
} from '../domain/invoicing-settings';
import {
  formatMoney,
  formatQuantity,
  formatVatRate,
  parseMoney,
  parseQuantity,
  parseVatRate,
} from '../domain/money';
import { DEFAULT_TOLERANCE_BASIS_POINTS, type Reconciliation } from '../domain/reconciliation';
import type {
  DeliveryNoteRecord,
  DeliveryNoteStore,
  DocumentFilter,
  InvoiceRecord,
  InvoiceStore,
  InvoiceSummaryRow,
  InvoicingSettingsStore,
  NoteToGroup,
  StaleNotesQuery,
  StoredFile,
} from '../application/ports/document-stores';

/** Decimals cross the boundary as exact strings, never through `number` (BR-INV-13). */
type DecimalLike = { toFixed(digits: number): string };
const money = (value: DecimalLike) => parseMoney(value.toFixed(2));
const quantity = (value: DecimalLike) => parseQuantity(value.toFixed(3));
const day = (date: Date) => date.toISOString().slice(0, 10);
const fromDay = (value: string) => new Date(`${value}T00:00:00Z`);

const isUniqueViolation = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === 'P2002';

const lineSelect = { concept: true, quantity: true, unit: true } as const;
const partySelect = { id: true, name: true, nif: true } as const;

const toLines = (lines: { concept: string; quantity: DecimalLike; unit: string }[]): Line[] =>
  lines.map((line) => ({
    concept: line.concept,
    quantity: quantity(line.quantity),
    unit: line.unit,
  }));

const lineData = (lines: readonly Line[]) =>
  lines.map((line, i) => ({
    position: i + 1,
    concept: line.concept,
    quantity: formatQuantity(line.quantity),
    unit: line.unit,
  }));

const fileOf = (row: { fileKey: string | null; fileName: string | null }): StoredFile | null =>
  row.fileKey && row.fileName ? { key: row.fileKey, name: row.fileName } : null;

function dateRange(filter: DocumentFilter, field: string) {
  if (!filter.from && !filter.to) return {};
  return {
    [field]: {
      ...(filter.from && { gte: fromDay(filter.from) }),
      ...(filter.to && { lte: fromDay(filter.to) }),
    },
  };
}

// ── Delivery notes ──

const noteSelect = {
  id: true,
  cooperativeId: true,
  operation: true,
  number: true,
  date: true,
  status: true,
  invoiceId: true,
  fileKey: true,
  fileName: true,
  createdAt: true,
  thirdParty: { select: partySelect },
  lines: { orderBy: { position: 'asc' }, select: lineSelect },
} as const;

type NoteRow = {
  id: string;
  cooperativeId: string;
  operation: DeliveryNoteRecord['operation'];
  number: string;
  date: Date;
  status: DeliveryNoteRecord['status'];
  invoiceId: string | null;
  fileKey: string | null;
  fileName: string | null;
  createdAt: Date;
  thirdParty: { id: string; name: string; nif: string };
  lines: { concept: string; quantity: DecimalLike; unit: string }[];
};

const toNote = (row: NoteRow): DeliveryNoteRecord => ({
  id: row.id,
  cooperativeId: row.cooperativeId,
  thirdParty: row.thirdParty,
  operation: row.operation,
  number: row.number,
  date: day(row.date),
  status: row.status,
  invoiceId: row.invoiceId,
  lines: toLines(row.lines),
  file: fileOf(row),
  createdAt: row.createdAt,
});

/** Unique and stable: (date, number) can repeat across third parties, the id breaks the tie. */
const NOTE_ORDER: Prisma.DeliveryNoteOrderByWithRelationInput[] = [
  { date: 'desc' },
  { number: 'desc' },
  { id: 'desc' },
];

function noteWhere(cooperativeId: string, filter: DocumentFilter & { status?: string }) {
  return {
    cooperativeId,
    ...(filter.operation && { operation: filter.operation }),
    ...(filter.thirdPartyId && { thirdPartyId: filter.thirdPartyId }),
    ...(filter.status && { status: filter.status as DeliveryNoteRecord['status'] }),
    ...dateRange(filter, 'date'),
  };
}

/** Rows after the cursor [date, number, id] in NOTE_ORDER (all descending). */
function afterNote(cursor: PageRequest['cursor']) {
  if (!cursor) return {};
  const [d, number, id] = cursor as [string, string, string];
  const date = fromDay(d);
  return {
    OR: [
      { date: { lt: date } },
      { date, number: { lt: number } },
      { date, number, id: { lt: id } },
    ],
  };
}

export class PrismaDeliveryNoteStore implements DeliveryNoteStore, StaleNotesQuery {
  constructor(private readonly prisma: PrismaClient) {}

  async list(
    cooperativeId: string,
    filter: DocumentFilter & { status?: DeliveryNoteRecord['status'] },
  ) {
    const rows = await this.prisma.deliveryNote.findMany({
      where: noteWhere(cooperativeId, filter),
      orderBy: NOTE_ORDER,
      select: noteSelect,
    });
    return rows.map(toNote);
  }

  async listPage(
    cooperativeId: string,
    filter: DocumentFilter & { status?: DeliveryNoteRecord['status'] },
    page: PageRequest,
  ) {
    const rows = await this.prisma.deliveryNote.findMany({
      where: { ...noteWhere(cooperativeId, filter), ...afterNote(page.cursor) },
      orderBy: NOTE_ORDER,
      take: page.limit,
      select: noteSelect,
    });
    return rows.map(toNote);
  }

  async find(cooperativeId: string, id: string) {
    const row = await this.prisma.deliveryNote.findFirst({
      where: { id, cooperativeId },
      select: noteSelect,
    });
    return row && toNote(row);
  }

  async create(
    cooperativeId: string,
    data: { thirdPartyId: string; state: DeliveryNoteState; file: StoredFile | null },
  ): Promise<DeliveryNoteRecord | 'duplicate'> {
    try {
      const row = await this.prisma.deliveryNote.create({
        data: {
          cooperativeId,
          thirdPartyId: data.thirdPartyId,
          operation: data.state.operation,
          number: data.state.number,
          date: fromDay(data.state.date),
          status: data.state.status,
          fileKey: data.file?.key,
          fileName: data.file?.name,
          lines: { create: lineData(data.state.lines) },
        },
        select: noteSelect,
      });
      return toNote(row);
    } catch (error) {
      if (isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
  }

  update(
    cooperativeId: string,
    id: string,
    decide: (current: DeliveryNoteRecord) => DeliveryNoteState,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "DeliveryNote" WHERE id = ${id}::uuid AND "cooperativeId" = ${cooperativeId}::uuid FOR UPDATE`;
      if (locked.length === 0) return null;
      const current = toNote(
        await tx.deliveryNote.findUniqueOrThrow({ where: { id }, select: noteSelect }),
      );
      const next = decide(current);
      return toNote(
        await tx.deliveryNote.update({
          where: { id },
          data: { status: next.status },
          select: noteSelect,
        }),
      );
    });
  }

  countPendingUpTo(cooperativeId: string, upTo: string | null): Promise<number> {
    return this.prisma.deliveryNote.count({
      where: {
        cooperativeId,
        status: 'pending_invoicing',
        ...(upTo !== null && { date: { lte: fromDay(upTo) } }),
      },
    });
  }
}

// ── Invoices ──

const invoiceSelect = {
  id: true,
  cooperativeId: true,
  operation: true,
  number: true,
  issueDate: true,
  dueDate: true,
  base: true,
  vatRate: true,
  total: true,
  paymentStatus: true,
  reconciliationStatus: true,
  settledAt: true,
  fileKey: true,
  fileName: true,
  createdAt: true,
  thirdParty: { select: partySelect },
  lines: { orderBy: { position: 'asc' }, select: lineSelect },
  deliveryNotes: { orderBy: { date: 'asc' }, select: { id: true, number: true, date: true } },
  discrepancies: {
    select: {
      id: true,
      concept: true,
      unit: true,
      deliveredQuantity: true,
      invoicedQuantity: true,
      explanation: true,
    },
  },
} as const;

type InvoiceRow = {
  id: string;
  cooperativeId: string;
  operation: InvoiceRecord['operation'];
  number: string;
  issueDate: Date;
  dueDate: Date;
  base: DecimalLike;
  vatRate: DecimalLike;
  total: DecimalLike;
  paymentStatus: InvoiceRecord['paymentStatus'];
  reconciliationStatus: InvoiceRecord['reconciliationStatus'];
  settledAt: Date | null;
  fileKey: string | null;
  fileName: string | null;
  createdAt: Date;
  thirdParty: { id: string; name: string; nif: string };
  lines: { concept: string; quantity: DecimalLike; unit: string }[];
  deliveryNotes: { id: string; number: string; date: Date }[];
  discrepancies: {
    id: string;
    concept: string;
    unit: string;
    deliveredQuantity: DecimalLike;
    invoicedQuantity: DecimalLike;
    explanation: string | null;
  }[];
};

const toInvoice = (row: InvoiceRow): InvoiceRecord => ({
  id: row.id,
  cooperativeId: row.cooperativeId,
  thirdParty: row.thirdParty,
  operation: row.operation,
  number: row.number,
  issueDate: day(row.issueDate),
  dueDate: day(row.dueDate),
  base: money(row.base),
  vatRate: parseVatRate(row.vatRate.toFixed(2)),
  total: money(row.total),
  lines: toLines(row.lines),
  paymentStatus: row.paymentStatus,
  settledAt: row.settledAt ? day(row.settledAt) : null,
  reconciliationStatus: row.reconciliationStatus,
  deliveryNotes: row.deliveryNotes.map((note) => ({ ...note, date: day(note.date) })),
  discrepancies: row.discrepancies.map((d) => ({
    id: d.id,
    concept: d.concept,
    unit: d.unit,
    deliveredQuantity: quantity(d.deliveredQuantity),
    invoicedQuantity: quantity(d.invoicedQuantity),
    explanation: d.explanation,
  })),
  file: fileOf(row),
  createdAt: row.createdAt,
});

type InvoiceFilter = DocumentFilter & {
  paymentStatus?: InvoiceRecord['paymentStatus'];
  reconciliationStatus?: InvoiceRecord['reconciliationStatus'];
};

/** Unique and stable: (issueDate, number) can repeat across third parties, the id breaks the tie. */
const INVOICE_ORDER: Prisma.InvoiceOrderByWithRelationInput[] = [
  { issueDate: 'desc' },
  { number: 'desc' },
  { id: 'desc' },
];

function invoiceWhere(cooperativeId: string, filter: InvoiceFilter) {
  return {
    cooperativeId,
    ...(filter.operation && { operation: filter.operation }),
    ...(filter.thirdPartyId && { thirdPartyId: filter.thirdPartyId }),
    ...(filter.paymentStatus && { paymentStatus: filter.paymentStatus }),
    ...(filter.reconciliationStatus && { reconciliationStatus: filter.reconciliationStatus }),
    ...dateRange(filter, 'issueDate'),
  };
}

/** Rows after the cursor [issueDate, number, id] in INVOICE_ORDER (all descending). */
function afterInvoice(cursor: PageRequest['cursor']) {
  if (!cursor) return {};
  const [d, number, id] = cursor as [string, string, string];
  const issueDate = fromDay(d);
  return {
    OR: [
      { issueDate: { lt: issueDate } },
      { issueDate, number: { lt: number } },
      { issueDate, number, id: { lt: id } },
    ],
  };
}

export class PrismaInvoiceStore implements InvoiceStore {
  constructor(private readonly prisma: PrismaClient) {}

  async list(cooperativeId: string, filter: InvoiceFilter) {
    const rows = await this.prisma.invoice.findMany({
      where: invoiceWhere(cooperativeId, filter),
      orderBy: INVOICE_ORDER,
      select: invoiceSelect,
    });
    return rows.map(toInvoice);
  }

  async listPage(cooperativeId: string, filter: InvoiceFilter, page: PageRequest) {
    const rows = await this.prisma.invoice.findMany({
      where: { ...invoiceWhere(cooperativeId, filter), ...afterInvoice(page.cursor) },
      orderBy: INVOICE_ORDER,
      take: page.limit,
      select: invoiceSelect,
    });
    return rows.map(toInvoice);
  }

  async find(cooperativeId: string, id: string) {
    const row = await this.prisma.invoice.findFirst({
      where: { id, cooperativeId },
      select: invoiceSelect,
    });
    return row && toInvoice(row);
  }

  async create(
    cooperativeId: string,
    data: {
      thirdPartyId: string;
      state: InvoiceState;
      deliveryNoteIds: string[];
      file: StoredFile | null;
    },
    decide: (notes: NoteToGroup[]) => Reconciliation,
  ): Promise<InvoiceRecord | 'duplicate' | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // BR-INV-05: lock the notes so two invoices cannot take the same one.
        const ids = data.deliveryNoteIds;
        if (ids.length > 0) {
          await tx.$queryRaw`
            SELECT id FROM "DeliveryNote"
            WHERE id = ANY(${ids}::uuid[]) AND "cooperativeId" = ${cooperativeId}::uuid
            FOR UPDATE`;
        }
        const notes = await tx.deliveryNote.findMany({
          where: { id: { in: ids }, cooperativeId },
          select: {
            id: true,
            thirdPartyId: true,
            operation: true,
            status: true,
            lines: { select: lineSelect },
          },
        });
        if (notes.length !== ids.length) return null;

        const reconciliation = decide(
          notes.map((note) => ({ ...note, lines: toLines(note.lines) })),
        );
        const { state } = data;
        const invoice = await tx.invoice.create({
          data: {
            cooperativeId,
            thirdPartyId: data.thirdPartyId,
            operation: state.operation,
            number: state.number,
            issueDate: fromDay(state.issueDate),
            dueDate: fromDay(state.dueDate),
            base: formatMoney(state.base),
            vatRate: formatVatRate(state.vatRate),
            total: formatMoney(state.total),
            paymentStatus: state.paymentStatus,
            reconciliationStatus: reconciliation.status,
            fileKey: data.file?.key,
            fileName: data.file?.name,
            lines: { create: lineData(state.lines) },
            discrepancies: {
              create: reconciliation.discrepancies.map((d) => ({
                concept: d.concept,
                unit: d.unit,
                deliveredQuantity: formatQuantity(d.deliveredQuantity),
                invoicedQuantity: formatQuantity(d.invoicedQuantity),
              })),
            },
          },
          select: { id: true },
        });
        if (ids.length > 0) {
          await tx.deliveryNote.updateMany({
            where: { id: { in: ids } },
            data: { status: 'invoiced', invoiceId: invoice.id },
          });
        }
        return toInvoice(
          await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, select: invoiceSelect }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) return 'duplicate';
      throw error;
    }
  }

  update(cooperativeId: string, id: string, decide: (current: InvoiceRecord) => InvoiceState) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Invoice" WHERE id = ${id}::uuid AND "cooperativeId" = ${cooperativeId}::uuid FOR UPDATE`;
      if (locked.length === 0) return null;
      const current = toInvoice(
        await tx.invoice.findUniqueOrThrow({ where: { id }, select: invoiceSelect }),
      );
      const next = decide(current);
      await tx.invoice.update({
        where: { id },
        data: {
          paymentStatus: next.paymentStatus,
          settledAt: next.settledAt ? fromDay(next.settledAt) : null,
        },
      });
      if (next.paymentStatus === 'voided' && current.paymentStatus !== 'voided') {
        // Its notes become available for the invoice that replaces it.
        await tx.deliveryNote.updateMany({
          where: { invoiceId: id },
          data: { status: 'pending_invoicing', invoiceId: null },
        });
      }
      return toInvoice(
        await tx.invoice.findUniqueOrThrow({ where: { id }, select: invoiceSelect }),
      );
    });
  }

  async totals(cooperativeId: string, thirdPartyId?: string): Promise<InvoiceSummaryRow[]> {
    const groups = await this.prisma.invoice.groupBy({
      by: ['operation', 'paymentStatus'],
      where: {
        cooperativeId,
        ...(thirdPartyId && { thirdPartyId }),
        paymentStatus: { in: ['pending', 'overdue'] },
      },
      _sum: { total: true },
      _count: true,
    });
    return groups.map((group) => ({
      operation: group.operation,
      paymentStatus: group.paymentStatus,
      total: group._sum.total ? money(group._sum.total) : 0n,
      count: group._count,
    }));
  }

  async saveExplanations(
    cooperativeId: string,
    invoiceId: string,
    drafts: { id: string; text: string }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      drafts.map((draft) =>
        this.prisma.discrepancy.updateMany({
          // Scoped through the invoice to the cooperative; never overwrites an existing text.
          where: {
            id: draft.id,
            explanation: null,
            invoice: { id: invoiceId, cooperativeId },
          },
          data: { explanation: draft.text },
        }),
      ),
    );
  }

  countDueUntil(cooperativeId: string, until: string): Promise<number> {
    return this.prisma.invoice.count({
      where: {
        cooperativeId,
        paymentStatus: { in: ['pending', 'overdue'] },
        dueDate: { lte: fromDay(until) },
      },
    });
  }

  countOpenDiscrepancies(cooperativeId: string): Promise<number> {
    return this.prisma.invoice.count({
      where: {
        cooperativeId,
        reconciliationStatus: 'with_discrepancy',
        paymentStatus: { in: ['pending', 'overdue'] },
      },
    });
  }
}

export class PrismaInvoicingSettingsStore implements InvoicingSettingsStore {
  constructor(private readonly prisma: PrismaClient) {}

  async toleranceBasisPoints(cooperativeId: string): Promise<number> {
    const row = await this.prisma.invoicingSettings.findUnique({ where: { cooperativeId } });
    return row?.toleranceBasisPoints ?? DEFAULT_TOLERANCE_BASIS_POINTS;
  }

  async noticeSettings(cooperativeId: string): Promise<InvoicingNoticeSettings> {
    const row = await this.prisma.invoicingSettings.findUnique({
      where: { cooperativeId },
      select: {
        invoiceNoticeEnabled: true,
        invoiceNoticeDays: true,
        noteDeadlineEnabled: true,
        noteDeadlineDays: true,
        noteNoticeEnabled: true,
        noteNoticeDays: true,
      },
    });
    return row ?? DEFAULT_INVOICING_NOTICE_SETTINGS;
  }

  async saveNoticeSettings(
    cooperativeId: string,
    settings: InvoicingNoticeSettings,
  ): Promise<void> {
    await this.prisma.invoicingSettings.upsert({
      where: { cooperativeId },
      create: { cooperativeId, ...settings },
      update: settings,
    });
  }
}
