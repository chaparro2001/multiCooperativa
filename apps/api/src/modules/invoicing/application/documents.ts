import type { CooperativeContext } from '../../access';
import type { EventPublisher } from '../../../shared/events';
import {
  type AcceptedFileType,
  detectFileType,
  EXTENSIONS,
  fileTypeFromName,
} from '../../../shared/domain/file-type';
import { type FileStorage, newFileKey } from '../../../shared/files/file-storage';
import {
  DAY_CURSOR,
  type Page,
  pageRequest,
  TEXT_CURSOR,
  toPage,
  UUID_CURSOR,
} from '../../../shared/pagination';
import {
  assertCanGroup,
  assertCanOperate,
  cancelDeliveryNote,
  cancelInvoice,
  createDeliveryNote,
  createInvoice,
  type DeliveryNoteStatus,
  type InvoiceInput,
  type LineInput,
  type Operation,
  type PaymentStatus,
  settle,
} from '../domain/documents';
import { noteDeadlineCutoff } from '../domain/invoicing-settings';
import { InvalidDocumentError } from '../domain/errors';
import { reconcile, type ReconciliationStatus } from '../domain/reconciliation';
import { DuplicateNumberError, NotFoundError } from './errors';
import type { InvoicingEvent } from './events';
import type {
  DeliveryNoteRecord,
  DeliveryNoteStore,
  DocumentFilter,
  InvoiceRecord,
  InvoiceStore,
  InvoicingSettingsStore,
  StaleNotesQuery,
  StoredFile,
} from './ports/document-stores';
import type { ThirdPartyStore } from './ports/third-party-store';
import { requireManage, requireRead, UUID } from './shared';

/** Same limit as other attachments; photos are reduced on the device first (NFR-INV-03). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface InvoicingDeps {
  thirdParties: ThirdPartyStore;
  deliveryNotes: DeliveryNoteStore;
  invoices: InvoiceStore;
  staleNotes: StaleNotesQuery;
  settings: InvoicingSettingsStore;
  files: FileStorage;
  events: EventPublisher<InvoicingEvent>;
  /** Today in the cooperative's calendar (YYYY-MM-DD). */
  today: () => string;
  now: () => Date;
}

export interface UploadedFile {
  name: string;
  content: Uint8Array;
}

/** A PDF or a photo, checked by content; null when the record comes without file. */
async function storeOriginal(
  deps: InvoicingDeps,
  context: CooperativeContext,
  file: UploadedFile | null,
): Promise<StoredFile | null> {
  if (!file) return null;
  const type = detectFileType(file.content);
  if (!type)
    throw new InvalidDocumentError('The file must be a PDF or a photo (JPEG or PNG).', 'file');
  if (file.content.byteLength > MAX_FILE_BYTES) {
    throw new InvalidDocumentError('The file can be at most 10 MB.', 'file');
  }
  const key = newFileKey(context.cooperativeId, 'invoices');
  await deps.files.put(key, file.content, type);
  // The extension carries the type, so it is known when the file is served.
  const base = file.name.replace(/\.[^.]*$/, '').trim() || 'document';
  return { key, name: `${base}.${EXTENSIONS[type as AcceptedFileType]}` };
}

async function withOriginal<T>(
  deps: InvoicingDeps,
  context: CooperativeContext,
  file: UploadedFile | null,
  save: (stored: StoredFile | null) => Promise<T>,
): Promise<T> {
  const stored = await storeOriginal(deps, context, file);
  try {
    return await save(stored);
  } catch (error) {
    if (stored) await deps.files.delete(stored.key).catch(() => undefined);
    throw error;
  }
}

async function activePartyFor(
  deps: InvoicingDeps,
  context: CooperativeContext,
  thirdPartyId: string,
  operation: Operation,
) {
  const party = UUID.test(thirdPartyId)
    ? await deps.thirdParties.find(context.cooperativeId, thirdPartyId)
    : null;
  if (!party) throw new NotFoundError();
  assertCanOperate(party, operation);
  return party;
}

export async function fileUrl(
  deps: InvoicingDeps,
  file: StoredFile | null,
): Promise<string | null> {
  if (!file) return null;
  return deps.files.signedDownloadUrl(file.key, {
    fileName: file.name,
    contentType: fileTypeFromName(file.name),
  });
}

// ── Delivery notes (US-INV-02) ──

export async function registerDeliveryNote(
  deps: InvoicingDeps,
  context: CooperativeContext,
  input: {
    thirdPartyId: string;
    operation: Operation;
    number: string;
    date: string;
    lines: LineInput[];
  },
  file: UploadedFile | null,
): Promise<DeliveryNoteRecord> {
  requireManage(context);
  const party = await activePartyFor(deps, context, input.thirdPartyId, input.operation);
  const state = createDeliveryNote(input);

  const note = await withOriginal(deps, context, file, async (stored) => {
    const created = await deps.deliveryNotes.create(context.cooperativeId, {
      thirdPartyId: party.id,
      state,
      file: stored,
    });
    if (created === 'duplicate') throw new DuplicateNumberError('delivery_note');
    return created;
  });

  await deps.events.publish({
    type: 'DeliveryNoteRegistered',
    occurredAt: deps.now(),
    payload: {
      cooperativeId: context.cooperativeId,
      thirdPartyId: party.id,
      operation: note.operation,
      deliveryNoteId: note.id,
    },
  });
  return note;
}

/**
 * Every delivery note of the filter, unbounded: for internal readers that filter further in
 * memory (the assistant's tools). The app's list is `listDeliveryNotesPage`.
 */
export async function listDeliveryNotes(
  deps: InvoicingDeps,
  context: CooperativeContext,
  filter: DocumentFilter & { status?: DeliveryNoteStatus },
): Promise<DeliveryNoteRecord[]> {
  requireRead(context);
  return deps.deliveryNotes.list(context.cooperativeId, filter);
}

const NOTE_CURSOR = [DAY_CURSOR, TEXT_CURSOR, UUID_CURSOR];

/** US-INV-06: a page of delivery notes, newest first; `before` is the previous `nextCursor`. */
export async function listDeliveryNotesPage(
  deps: InvoicingDeps,
  context: CooperativeContext,
  filter: DocumentFilter & { status?: DeliveryNoteStatus },
  page: { limit: number; before?: string },
): Promise<Page<DeliveryNoteRecord>> {
  requireRead(context);
  const rows = await deps.deliveryNotes.listPage(context.cooperativeId, filter, {
    ...pageRequest(page, NOTE_CURSOR),
    limit: page.limit + 1,
  });
  return toPage(rows, page.limit, (note) => [note.date, note.number, note.id]);
}

export async function getDeliveryNote(
  deps: InvoicingDeps,
  context: CooperativeContext,
  id: string,
) {
  requireRead(context);
  const note = UUID.test(id) ? await deps.deliveryNotes.find(context.cooperativeId, id) : null;
  if (!note) throw new NotFoundError();
  return { ...note, fileUrl: await fileUrl(deps, note.file) };
}

export async function cancelNote(deps: InvoicingDeps, context: CooperativeContext, id: string) {
  requireManage(context);
  const note = UUID.test(id)
    ? await deps.deliveryNotes.update(context.cooperativeId, id, (current) =>
        cancelDeliveryNote(current),
      )
    : null;
  if (!note) throw new NotFoundError();
  return note;
}

// ── Invoices (US-INV-03, US-INV-04, US-INV-07) ──

/** Registers, groups its notes and reconciles in one step (US-INV-03, US-INV-04). */
export async function registerInvoice(
  deps: InvoicingDeps,
  context: CooperativeContext,
  input: InvoiceInput & { thirdPartyId: string; deliveryNoteIds: string[] },
  file: UploadedFile | null,
): Promise<InvoiceRecord> {
  requireManage(context);
  const party = await activePartyFor(deps, context, input.thirdPartyId, input.operation);
  const state = createInvoice(input);
  if (input.deliveryNoteIds.some((id) => !UUID.test(id))) throw new NotFoundError();
  const deliveryNoteIds = [...new Set(input.deliveryNoteIds)];
  const toleranceBasisPoints = await deps.settings.toleranceBasisPoints(context.cooperativeId);

  const invoice = await withOriginal(deps, context, file, async (stored) => {
    const created = await deps.invoices.create(
      context.cooperativeId,
      { thirdPartyId: party.id, state, deliveryNoteIds, file: stored },
      (notes) => {
        assertCanGroup(
          { operation: state.operation, thirdPartyId: party.id, lines: state.lines },
          notes,
        );
        return reconcile({
          invoiceLines: state.lines,
          noteLines: notes.length > 0 ? notes.flatMap((note) => note.lines) : null,
          toleranceBasisPoints,
        });
      },
    );
    if (created === 'duplicate') throw new DuplicateNumberError('invoice');
    if (!created) throw new NotFoundError();
    return created;
  });

  const ref = {
    cooperativeId: context.cooperativeId,
    thirdPartyId: party.id,
    operation: invoice.operation,
    invoiceId: invoice.id,
  };
  await deps.events.publish({ type: 'InvoiceRegistered', occurredAt: deps.now(), payload: ref });
  if (invoice.reconciliationStatus === 'with_discrepancy') {
    await deps.events.publish({
      type: 'DiscrepancyDetected',
      occurredAt: deps.now(),
      payload: ref,
    });
  }
  return invoice;
}

type InvoiceFilter = DocumentFilter & {
  paymentStatus?: PaymentStatus;
  reconciliationStatus?: ReconciliationStatus;
};

/** Every invoice of the filter, unbounded: for internal readers (the assistant's tools). The app's list is `listInvoicesPage`. */
export async function listInvoices(
  deps: InvoicingDeps,
  context: CooperativeContext,
  filter: InvoiceFilter,
): Promise<InvoiceRecord[]> {
  requireRead(context);
  return deps.invoices.list(context.cooperativeId, filter);
}

const INVOICE_CURSOR = [DAY_CURSOR, TEXT_CURSOR, UUID_CURSOR];

/** US-INV-06: a page of invoices, newest first; `before` is the previous `nextCursor`. */
export async function listInvoicesPage(
  deps: InvoicingDeps,
  context: CooperativeContext,
  filter: InvoiceFilter,
  page: { limit: number; before?: string },
): Promise<Page<InvoiceRecord>> {
  requireRead(context);
  const rows = await deps.invoices.listPage(context.cooperativeId, filter, {
    ...pageRequest(page, INVOICE_CURSOR),
    limit: page.limit + 1,
  });
  return toPage(rows, page.limit, (invoice) => [invoice.issueDate, invoice.number, invoice.id]);
}

export async function getInvoice(deps: InvoicingDeps, context: CooperativeContext, id: string) {
  requireRead(context);
  const invoice = UUID.test(id) ? await deps.invoices.find(context.cooperativeId, id) : null;
  if (!invoice) throw new NotFoundError();
  return { ...invoice, fileUrl: await fileUrl(deps, invoice.file) };
}

async function updateInvoice(
  deps: InvoicingDeps,
  context: CooperativeContext,
  id: string,
  decide: Parameters<InvoiceStore['update']>[2],
): Promise<InvoiceRecord> {
  const invoice = UUID.test(id)
    ? await deps.invoices.update(context.cooperativeId, id, decide)
    : null;
  if (!invoice) throw new NotFoundError();
  return invoice;
}

/** US-INV-07: paid (purchase) or collected (sale) on a date. */
export async function settleInvoice(
  deps: InvoicingDeps,
  context: CooperativeContext,
  id: string,
  on: string,
) {
  requireManage(context);
  return updateInvoice(deps, context, id, (current) => settle(current, on));
}

/** “Register the new one and void the old one”: its notes become available again. */
export async function cancelInvoiceById(
  deps: InvoicingDeps,
  context: CooperativeContext,
  id: string,
) {
  requireManage(context);
  return updateInvoice(deps, context, id, (current) => cancelInvoice(current));
}

// ── Summary (US-INV-07, US-INV-09) and third-party sheet (US-INV-06) ──

export interface Amounts {
  pending: bigint;
  overdue: bigint;
  pendingCount: number;
  overdueCount: number;
}

function amountsOf(
  rows: Awaited<ReturnType<InvoiceStore['totals']>>,
  operation: Operation,
): Amounts {
  const of = (status: PaymentStatus) =>
    rows.find((row) => row.operation === operation && row.paymentStatus === status);
  const pending = of('pending');
  const overdue = of('overdue');
  return {
    // “Pending” includes what is overdue: everything still to pay or collect.
    pending: (pending?.total ?? 0n) + (overdue?.total ?? 0n),
    overdue: overdue?.total ?? 0n,
    pendingCount: (pending?.count ?? 0) + (overdue?.count ?? 0),
    overdueCount: overdue?.count ?? 0,
  };
}

export async function summary(deps: InvoicingDeps, context: CooperativeContext) {
  requireRead(context);
  // US-INV-09: stale = past the cooperative deadline (BR-INV-15); with the deadline off there are none.
  const settings = await deps.settings.noticeSettings(context.cooperativeId);
  const cutoff = noteDeadlineCutoff(deps.today(), settings);
  const [rows, openDiscrepancies, staleDeliveryNotes] = await Promise.all([
    deps.invoices.totals(context.cooperativeId),
    deps.invoices.countOpenDiscrepancies(context.cooperativeId),
    cutoff === null ? 0 : deps.staleNotes.countPendingUpTo(context.cooperativeId, cutoff),
  ]);
  return {
    toPay: amountsOf(rows, 'purchase'),
    toCollect: amountsOf(rows, 'sale'),
    openDiscrepancies,
    staleDeliveryNotes,
  };
}

/** US-INV-06: the party with its notes, its invoices and the outstanding balance. */
export async function thirdPartySheet(
  deps: InvoicingDeps,
  context: CooperativeContext,
  id: string,
) {
  requireRead(context);
  const party = UUID.test(id) ? await deps.thirdParties.find(context.cooperativeId, id) : null;
  if (!party) throw new NotFoundError();
  const [deliveryNotes, invoices, rows] = await Promise.all([
    deps.deliveryNotes.list(context.cooperativeId, { thirdPartyId: id }),
    deps.invoices.list(context.cooperativeId, { thirdPartyId: id }),
    deps.invoices.totals(context.cooperativeId, id),
  ]);
  return {
    party,
    deliveryNotes,
    invoices,
    balance: { toPay: amountsOf(rows, 'purchase'), toCollect: amountsOf(rows, 'sale') },
  };
}
