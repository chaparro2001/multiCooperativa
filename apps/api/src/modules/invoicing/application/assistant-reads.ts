import type { CooperativeContext } from '../../access';
import type { DeliveryNoteStatus, Operation, PaymentStatus } from '../domain/documents';
import { formatMoney, formatQuantity } from '../domain/money';
import { type Amounts, listDeliveryNotes, listInvoices, summary } from './documents';
import { listThirdParties, type ThirdPartyDeps } from './third-parties';
import type { InvoicingDeps } from './documents';

export interface AssistantFilter {
  operation?: Operation;
  /** Name or tax ID fragment of the supplier or customer. */
  thirdParty?: string;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
}

export interface InvoiceLine {
  id: string;
  operation: Operation;
  number: string;
  thirdParty: string;
  issueDate: string;
  dueDate: string;
  total: string;
  paymentStatus: PaymentStatus;
  reconciliationStatus: string;
}

export interface DeliveryNoteLine {
  id: string;
  operation: Operation;
  number: string;
  thirdParty: string;
  date: string;
  status: DeliveryNoteStatus;
  lines: { concept: string; quantity: string; unit: string }[];
}

/** What the AI assistant reads (requirements/07, section 3). Same use cases, same permissions. */
export interface InvoicingReads {
  invoices(
    context: CooperativeContext,
    filter: AssistantFilter & {
      status?: PaymentStatus;
      /** YYYY-MM-DD, inclusive: invoices falling due in this range. */
      dueFrom?: string;
      dueTo?: string;
    },
  ): Promise<InvoiceLine[]>;
  deliveryNotes(
    context: CooperativeContext,
    filter: AssistantFilter & { status?: DeliveryNoteStatus },
  ): Promise<DeliveryNoteLine[]>;
  summary(context: CooperativeContext): Promise<{
    toPay: AmountsView;
    toCollect: AmountsView;
    openDiscrepancies: number;
    staleDeliveryNotes: number;
  }>;
  findThirdParties(
    context: CooperativeContext,
    text: string,
  ): Promise<{ id: string; name: string; nif: string; supplier: boolean; customer: boolean }[]>;
}

export interface AmountsView {
  pending: string;
  overdue: string;
  pendingCount: number;
  overdueCount: number;
}

/** A listing returns at most this many rows to the model. */
export const MAX_ROWS = 25;

const toAmounts = (amounts: Amounts): AmountsView => ({
  pending: formatMoney(amounts.pending),
  overdue: formatMoney(amounts.overdue),
  pendingCount: amounts.pendingCount,
  overdueCount: amounts.overdueCount,
});

const matches = (party: { name: string; nif: string }, text: string | undefined) => {
  if (!text) return true;
  const needle = text.trim().toLowerCase();
  return party.name.toLowerCase().includes(needle) || party.nif.toLowerCase().includes(needle);
};

export function createInvoicingReads(deps: InvoicingDeps & ThirdPartyDeps): InvoicingReads {
  return {
    async invoices(context, { status, thirdParty, dueFrom, dueTo, ...filter }) {
      const rows = await listInvoices(deps, context, { ...filter, paymentStatus: status });
      return rows
        .filter((row) => matches(row.thirdParty, thirdParty))
        .filter((row) => (!dueFrom || row.dueDate >= dueFrom) && (!dueTo || row.dueDate <= dueTo))
        .slice(0, MAX_ROWS)
        .map((row) => ({
          id: row.id,
          operation: row.operation,
          number: row.number,
          thirdParty: row.thirdParty.name,
          issueDate: row.issueDate,
          dueDate: row.dueDate,
          total: formatMoney(row.total),
          paymentStatus: row.paymentStatus,
          reconciliationStatus: row.reconciliationStatus,
        }));
    },

    async deliveryNotes(context, { status, thirdParty, ...filter }) {
      const rows = await listDeliveryNotes(deps, context, { ...filter, status });
      return rows
        .filter((row) => matches(row.thirdParty, thirdParty))
        .slice(0, MAX_ROWS)
        .map((row) => ({
          id: row.id,
          operation: row.operation,
          number: row.number,
          thirdParty: row.thirdParty.name,
          date: row.date,
          status: row.status,
          lines: row.lines.map((line) => ({
            concept: line.concept,
            quantity: formatQuantity(line.quantity),
            unit: line.unit,
          })),
        }));
    },

    async summary(context) {
      const result = await summary(deps, context);
      return {
        toPay: toAmounts(result.toPay),
        toCollect: toAmounts(result.toCollect),
        openDiscrepancies: result.openDiscrepancies,
        staleDeliveryNotes: result.staleDeliveryNotes,
      };
    },

    async findThirdParties(context, text) {
      const rows = await listThirdParties(deps, context, { search: text });
      return rows.slice(0, MAX_ROWS).map((row) => ({
        id: row.id,
        name: row.name,
        nif: row.nif,
        supplier: row.isSupplier,
        customer: row.isCustomer,
      }));
    },
  };
}
