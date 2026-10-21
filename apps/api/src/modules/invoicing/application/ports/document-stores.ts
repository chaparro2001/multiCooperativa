import type {
  DeliveryNoteState,
  DeliveryNoteStatus,
  InvoiceState,
  Line,
  Operation,
  PaymentStatus,
} from '../../domain/documents';
import type { InvoicingNoticeSettings } from '../../domain/invoicing-settings';
import type {
  Discrepancy,
  Reconciliation,
  ReconciliationStatus,
} from '../../domain/reconciliation';

export interface PartyRef {
  id: string;
  name: string;
  nif: string;
}

export interface StoredFile {
  key: string;
  name: string;
}

export interface DeliveryNoteRecord extends DeliveryNoteState {
  id: string;
  cooperativeId: string;
  thirdParty: PartyRef;
  invoiceId: string | null;
  file: StoredFile | null;
  createdAt: Date;
}

export interface DiscrepancyRecord extends Discrepancy {
  id: string;
  explanation: string | null;
}

export interface InvoiceRecord extends InvoiceState {
  id: string;
  cooperativeId: string;
  thirdParty: PartyRef;
  reconciliationStatus: ReconciliationStatus;
  deliveryNotes: { id: string; number: string; date: string }[];
  discrepancies: DiscrepancyRecord[];
  file: StoredFile | null;
  createdAt: Date;
}

export interface DocumentFilter {
  operation?: Operation;
  thirdPartyId?: string;
  from?: string;
  to?: string;
}

/** A delivery note as the invoice registration sees it, locked. */
export interface NoteToGroup {
  id: string;
  thirdPartyId: string;
  operation: Operation;
  status: DeliveryNoteStatus;
  lines: Line[];
}

/** Every method is scoped to one cooperative (BR-INV-01). */
export interface DeliveryNoteStore {
  list(
    cooperativeId: string,
    filter: DocumentFilter & { status?: DeliveryNoteStatus },
  ): Promise<DeliveryNoteRecord[]>;
  find(cooperativeId: string, id: string): Promise<DeliveryNoteRecord | null>;
  /** 'duplicate' when the party already has a note with that number (BR-INV-04). */
  create(
    cooperativeId: string,
    data: { thirdPartyId: string; state: DeliveryNoteState; file: StoredFile | null },
  ): Promise<DeliveryNoteRecord | 'duplicate'>;
  update(
    cooperativeId: string,
    id: string,
    decide: (current: DeliveryNoteRecord) => DeliveryNoteState,
  ): Promise<DeliveryNoteRecord | null>;
}

export interface InvoiceSummaryRow {
  operation: Operation;
  paymentStatus: PaymentStatus;
  total: bigint;
  count: number;
}

export interface InvoiceStore {
  list(
    cooperativeId: string,
    filter: DocumentFilter & {
      paymentStatus?: PaymentStatus;
      reconciliationStatus?: ReconciliationStatus;
    },
  ): Promise<InvoiceRecord[]>;
  find(cooperativeId: string, id: string): Promise<InvoiceRecord | null>;
  /**
   * One transaction: locks the notes, lets `decide` validate the grouping and
   * reconcile, stores invoice, lines and discrepancies, and marks the notes
   * as invoiced. 'duplicate' on a repeated number (BR-INV-04); null if a note
   * does not exist in this cooperative.
   */
  create(
    cooperativeId: string,
    data: {
      thirdPartyId: string;
      state: InvoiceState;
      deliveryNoteIds: string[];
      file: StoredFile | null;
    },
    decide: (notes: NoteToGroup[]) => Reconciliation,
  ): Promise<InvoiceRecord | 'duplicate' | null>;
  /** Locked; when the invoice is cancelled its notes go back to pending. */
  update(
    cooperativeId: string,
    id: string,
    decide: (current: InvoiceRecord) => InvoiceState,
  ): Promise<InvoiceRecord | null>;
  /** Totals by operation and payment status, for the summary (US-INV-07). */
  totals(cooperativeId: string, thirdPartyId?: string): Promise<InvoiceSummaryRow[]>;
  countOpenDiscrepancies(cooperativeId: string): Promise<number>;
  /** Pending or overdue invoices due on or before `until` (BR-INV-16): overdue ones included. */
  countDueUntil(cooperativeId: string, until: string): Promise<number>;
  /** AI-drafted texts for discrepancies of this invoice that have none yet (BR-INV-12). */
  saveExplanations(
    cooperativeId: string,
    invoiceId: string,
    drafts: { id: string; text: string }[],
  ): Promise<void>;
}

/** US-INV-09: pending notes older than a date, per party. */
export interface StaleNotesQuery {
  /** Notes pending invoicing dated on or before `upTo`; `null` counts all of them (BR-INV-16). */
  countPendingUpTo(cooperativeId: string, upTo: string | null): Promise<number>;
}

export interface InvoicingSettingsStore {
  toleranceBasisPoints(cooperativeId: string): Promise<number>;
  /** BR-INV-15: the cooperative's three alerts, the defaults when it never chose. */
  noticeSettings(cooperativeId: string): Promise<InvoicingNoticeSettings>;
  saveNoticeSettings(cooperativeId: string, settings: InvoicingNoticeSettings): Promise<void>;
}

/** Leaves a trace in the cooperative's audit log; provided by the access module (US-ACC-12). */
export type AuditRecorder = (
  cooperativeId: string,
  event: { actorUserId: string; action: string; detail: Record<string, unknown> },
) => Promise<void>;
