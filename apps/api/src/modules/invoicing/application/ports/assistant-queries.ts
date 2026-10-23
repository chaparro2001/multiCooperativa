import type { Day, Operation, PaymentStatus } from '../../domain/documents';
import type { DueInvoice, ItemLine } from '../../domain/analytics';

/** Read-only queries made for the AI assistant (requirements/07). Every one is scoped to a cooperative (BR-INV-01). */
export interface InvoiceTotalsFilter {
  operation?: Operation;
  /** Issue date, inclusive. */
  from?: Day;
  to?: Day;
  /** Settlement date, inclusive; only settled invoices have one. */
  settledFrom?: Day;
  settledTo?: Day;
  thirdPartyId?: string;
  /** Part of the name or tax ID. */
  thirdParty?: string;
  /** Voided invoices are left out unless this asks for them. */
  paymentStatus?: PaymentStatus;
}

export interface TotalsGroup {
  /** Third party id or YYYY-MM; null when not grouped. */
  key: string | null;
  /** Third party name; null otherwise. */
  label: string | null;
  count: number;
  /** Cents. */
  base: bigint;
  total: bigint;
}

export type TotalsGroupBy = 'none' | 'third_party' | 'month';

export interface PartyActivity {
  lastDeliveryNote: { number: string; date: Day; operation: Operation } | null;
  lastInvoice: { number: string; issueDate: Day; operation: Operation } | null;
  deliveryNotesInRange: Record<Operation, number>;
}

export interface InactiveParty {
  id: string;
  name: string;
  nif: string;
  isSupplier: boolean;
  isCustomer: boolean;
  createdAt: Date;
  /** Latest delivery note or invoice date; null if it never had one. */
  lastActivity: Day | null;
}

export interface AssistantQueries {
  /**
   * Sums computed by the database (exact decimals). Ranked by total, highest first, when grouped
   * by third party; oldest month first when grouped by month. `groups` is the number of groups
   * before `limit`.
   */
  invoiceTotals(
    cooperativeId: string,
    filter: InvoiceTotalsFilter,
    options: { groupBy: TotalsGroupBy; limit: number },
  ): Promise<{ rows: TotalsGroup[]; groups: number }>;
  /** Pending and overdue invoices, by due date (inclusive range). */
  dueInvoices(
    cooperativeId: string,
    filter: { operation?: Operation; dueFrom?: Day; dueTo?: Day },
  ): Promise<DueInvoice[]>;
  /** Lines of non-voided delivery notes (by their date) or invoices (by issue date). */
  itemLines(
    cooperativeId: string,
    filter: { source: 'delivery_notes' | 'invoices'; operation?: Operation; from?: Day; to?: Day },
  ): Promise<ItemLine[]>;
  partyActivity(
    cooperativeId: string,
    thirdPartyId: string,
    range: { from: Day; to: Day },
  ): Promise<PartyActivity>;
  /** Active third parties with no delivery note or invoice dated on or after `since`. */
  inactiveParties(
    cooperativeId: string,
    filter: { since: Day; role?: 'supplier' | 'customer' },
  ): Promise<InactiveParty[]>;
}
