import type { CooperativeContext } from '../../access';
import {
  bucketByDueDate,
  daysBetween,
  type Flow,
  type Granularity,
  rankItems,
} from '../domain/analytics';
import {
  addDays,
  type DeliveryNoteStatus,
  type Operation,
  type PaymentStatus,
} from '../domain/documents';
import { formatMoney, formatQuantity, formatVatRate } from '../domain/money';
import { normalizeNif } from '../domain/nif';
import {
  type Amounts,
  amountsOf,
  listDeliveryNotes,
  listInvoices,
  summary,
  type InvoicingDeps,
} from './documents';
import type { AssistantQueries, TotalsGroup } from './ports/assistant-queries';
import type { InvoiceRecord } from './ports/document-stores';
import { requireRead } from './shared';
import { listThirdParties, type ThirdPartyDeps } from './third-parties';

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
  base: string;
  vatRate: string;
  total: string;
  paymentStatus: PaymentStatus;
  settledAt: string | null;
  reconciliationStatus: string;
}

/** A listing: at most MAX_ROWS rows, and how many matched in all (`total` > rows means truncated). */
export interface Listing<T> {
  rows: T[];
  total: number;
}

export interface DeliveryNoteLine {
  id: string;
  operation: Operation;
  number: string;
  thirdParty: string;
  date: string;
  status: DeliveryNoteStatus;
  /** Days since its date; only for notes still pending invoicing. */
  ageDays?: number;
  lines: { concept: string; quantity: string; unit: string }[];
}

export interface DiscrepancyView {
  concept: string;
  unit: string;
  deliveredQuantity: string;
  invoicedQuantity: string;
  /** Invoiced minus delivered. */
  difference: string;
  /** AI-drafted and indicative only (BR-INV-12); null while nobody asked for it. */
  explanation: string | null;
}

export interface InvoiceDetail {
  id: string;
  operation: Operation;
  number: string;
  thirdParty: string;
  issueDate: string;
  dueDate: string;
  base: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  paymentStatus: PaymentStatus;
  settledAt: string | null;
  reconciliationStatus: string;
  lines: { concept: string; quantity: string; unit: string }[];
  deliveryNotes: { number: string; date: string }[];
  discrepancies: DiscrepancyView[];
}

export interface MoneyTotals {
  count: number;
  base: string;
  vatAmount: string;
  total: string;
}

export interface FlowView {
  total: string;
  count: number;
  overdueTotal: string;
  overdueCount: number;
}

export interface PartyRef {
  id: string;
  name: string;
  nif: string;
  supplier: boolean;
  customer: boolean;
}

export interface ThirdPartySummary extends PartyRef {
  toPay: AmountsView;
  toCollect: AmountsView;
  lastDeliveryNote: { number: string; date: string; operation: Operation } | null;
  lastInvoice: { number: string; issueDate: string; operation: Operation } | null;
  year: string;
  /** Not voided ones, dated in the current year. */
  thisYear: Record<
    'purchases' | 'sales',
    { invoices: number; invoicedTotal: string; deliveryNotes: number }
  >;
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
      /** YYYY-MM-DD, inclusive: invoices settled (paid or collected) in this range. */
      settledFrom?: string;
      settledTo?: string;
    },
  ): Promise<Listing<InvoiceLine>>;
  deliveryNotes(
    context: CooperativeContext,
    filter: AssistantFilter & {
      status?: DeliveryNoteStatus;
      sort?: 'newest_first' | 'oldest_first';
    },
  ): Promise<Listing<DeliveryNoteLine>>;
  summary(context: CooperativeContext): Promise<{
    toPay: AmountsView;
    toCollect: AmountsView;
    openDiscrepancies: number;
    staleDeliveryNotes: number;
  }>;
  findThirdParties(context: CooperativeContext, text: string): Promise<PartyRef[]>;
  /** Newest first by creation date; inactive ones only if the user can manage third parties. */
  listThirdParties(
    context: CooperativeContext,
    filter: {
      type?: 'supplier' | 'customer';
      /** YYYY-MM-DD, inclusive. */
      createdFrom?: string;
      createdTo?: string;
      includeInactive?: boolean;
      /**
       * Active ones with no delivery note or invoice dated on or after this day (YYYY-MM-DD),
       * longest quiet first; the creation dates and `includeInactive` do not apply.
       */
      inactiveSince?: string;
      limit?: number;
    },
  ): Promise<Listing<ThirdPartyLine>>;
  /**
   * What the cooperative bought from and sold to the third parties whose NIF is in `nifs`
   * (normalized), voided invoices left out (ADR-025). Only the third parties that exist.
   */
  tradeByNif(
    context: CooperativeContext,
    nifs: readonly string[],
    period: { from?: string; to?: string },
  ): Promise<NifTrade[]>;
  /** Sums computed by the database, optionally ranked by third party or split by month. */
  invoiceTotals(
    context: CooperativeContext,
    filter: AssistantFilter & {
      status?: PaymentStatus;
      settledFrom?: string;
      settledTo?: string;
      groupBy: 'none' | 'third_party' | 'month';
      limit: number;
    },
  ): Promise<{
    overall: MoneyTotals;
    groups: (MoneyTotals & { key: string; label: string | null })[];
    groupCount: number;
  }>;
  /** `summary` only when the text names exactly one third party; otherwise the candidates. */
  thirdPartySummary(
    context: CooperativeContext,
    text: string,
  ): Promise<{ candidates: PartyRef[]; summary: ThirdPartySummary | null }>;
  /** Up to MAX_DETAILS invoices with that number (it can exist for several suppliers). */
  invoiceDetail(
    context: CooperativeContext,
    filter: { number: string; operation?: Operation; thirdParty?: string },
  ): Promise<Listing<InvoiceDetail>>;
  /** Invoices still to pay or collect whose delivery notes do not match, most urgent first. */
  openDiscrepancies(
    context: CooperativeContext,
    filter: { operation?: Operation },
  ): Promise<Listing<InvoiceDetail>>;
  /** Pending and overdue invoices bucketed by due date. */
  cashForecast(
    context: CooperativeContext,
    filter: {
      operation?: Operation;
      dueFrom?: string;
      dueTo?: string;
      granularity: Granularity;
    },
  ): Promise<{
    overall: { toPay: FlowView; toCollect: FlowView };
    buckets: { from: string; to: string; toPay: FlowView; toCollect: FlowView }[];
    bucketCount: number;
  }>;
  /** Quantities of concepts in delivery notes (or invoices) added per normalized concept and unit. */
  topItems(
    context: CooperativeContext,
    filter: {
      source: 'delivery_notes' | 'invoices';
      operation?: Operation;
      from?: string;
      to?: string;
      concept?: string;
      groupBy: 'none' | 'month';
      limit: number;
    },
  ): Promise<{
    rows: { concept: string; unit: string; quantity: string; lines: number; period?: string }[];
    total: number;
    truncated: boolean;
  }>;
}

export interface NifTrade {
  nif: string;
  name: string;
  supplier: boolean;
  customer: boolean;
  /** Invoices received from it (purchases): euros, exact decimal string. */
  purchases: { total: string; count: number };
  /** Invoices issued to it (sales). */
  sales: { total: string; count: number };
}

export interface ThirdPartyLine {
  id: string;
  name: string;
  nif: string;
  supplier: boolean;
  customer: boolean;
  active: boolean;
  /** YYYY-MM-DD. */
  createdAt: string;
  email: string | null;
  phone: string | null;
  /** Latest delivery note or invoice date; only when listing inactive third parties. */
  lastActivity?: string | null;
}

export interface AmountsView {
  pending: string;
  overdue: string;
  pendingCount: number;
  overdueCount: number;
}

/** A listing returns at most this many rows to the model. */
export const MAX_ROWS = 25;
export const DEFAULT_THIRD_PARTIES = 10;
export const MAX_THIRD_PARTIES = 50;
export const MAX_DETAILS = 5;
export const MAX_BUCKETS = 26;

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

const listing = <T, R>(all: T[], limit: number, map: (row: T) => R): Listing<R> => ({
  rows: all.slice(0, limit).map(map),
  total: all.length,
});

const partyRef = (row: {
  id: string;
  name: string;
  nif: string;
  isSupplier: boolean;
  isCustomer: boolean;
}): PartyRef => ({
  id: row.id,
  name: row.name,
  nif: row.nif,
  supplier: row.isSupplier,
  customer: row.isCustomer,
});

const toMoneyTotals = (group: TotalsGroup | undefined): MoneyTotals => ({
  count: group?.count ?? 0,
  base: formatMoney(group?.base ?? 0n),
  // Total = base + VAT, so the VAT of a sum is the difference of the sums.
  vatAmount: formatMoney((group?.total ?? 0n) - (group?.base ?? 0n)),
  total: formatMoney(group?.total ?? 0n),
});

const toFlowView = (flow: Flow): FlowView => ({
  total: formatMoney(flow.total),
  count: flow.count,
  overdueTotal: formatMoney(flow.overdueTotal),
  overdueCount: flow.overdueCount,
});

const lineViews = (lines: readonly { concept: string; quantity: bigint; unit: string }[]) =>
  lines.map((line) => ({
    concept: line.concept,
    quantity: formatQuantity(line.quantity),
    unit: line.unit,
  }));

const toDetail = (row: InvoiceRecord): InvoiceDetail => ({
  id: row.id,
  operation: row.operation,
  number: row.number,
  thirdParty: row.thirdParty.name,
  issueDate: row.issueDate,
  dueDate: row.dueDate,
  base: formatMoney(row.base),
  vatRate: formatVatRate(row.vatRate),
  vatAmount: formatMoney(row.total - row.base),
  total: formatMoney(row.total),
  paymentStatus: row.paymentStatus,
  settledAt: row.settledAt,
  reconciliationStatus: row.reconciliationStatus,
  lines: lineViews(row.lines),
  deliveryNotes: row.deliveryNotes.map((note) => ({ number: note.number, date: note.date })),
  discrepancies: row.discrepancies.map((d) => ({
    concept: d.concept,
    unit: d.unit,
    deliveredQuantity: formatQuantity(d.deliveredQuantity),
    invoicedQuantity: formatQuantity(d.invoicedQuantity),
    difference: formatQuantity(d.invoicedQuantity - d.deliveredQuantity),
    explanation: d.explanation,
  })),
});

export function createInvoicingReads(
  deps: InvoicingDeps & ThirdPartyDeps & { assistantQueries: AssistantQueries },
): InvoicingReads {
  const queries = deps.assistantQueries;

  return {
    async invoices(
      context,
      { status, thirdParty, dueFrom, dueTo, settledFrom, settledTo, ...filter },
    ) {
      const rows = await listInvoices(deps, context, { ...filter, paymentStatus: status });
      const matching = rows
        .filter((row) => matches(row.thirdParty, thirdParty))
        .filter((row) => (!dueFrom || row.dueDate >= dueFrom) && (!dueTo || row.dueDate <= dueTo))
        .filter(
          (row) =>
            (!settledFrom || (row.settledAt !== null && row.settledAt >= settledFrom)) &&
            (!settledTo || (row.settledAt !== null && row.settledAt <= settledTo)),
        );
      return listing(matching, MAX_ROWS, (row) => ({
        id: row.id,
        operation: row.operation,
        number: row.number,
        thirdParty: row.thirdParty.name,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        base: formatMoney(row.base),
        vatRate: formatVatRate(row.vatRate),
        total: formatMoney(row.total),
        paymentStatus: row.paymentStatus,
        settledAt: row.settledAt,
        reconciliationStatus: row.reconciliationStatus,
      }));
    },

    async deliveryNotes(context, { status, thirdParty, sort, ...filter }) {
      const rows = await listDeliveryNotes(deps, context, { ...filter, status });
      const matching = rows.filter((row) => matches(row.thirdParty, thirdParty));
      // The store returns the newest first.
      if (sort === 'oldest_first') matching.reverse();
      const today = deps.today();
      return listing(matching, MAX_ROWS, (row) => ({
        id: row.id,
        operation: row.operation,
        number: row.number,
        thirdParty: row.thirdParty.name,
        date: row.date,
        status: row.status,
        ...(row.status === 'pending_invoicing' && { ageDays: daysBetween(row.date, today) }),
        lines: lineViews(row.lines),
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
      return rows.slice(0, MAX_ROWS).map(partyRef);
    },

    async listThirdParties(context, filter) {
      requireRead(context);
      const limit = Math.min(filter.limit ?? DEFAULT_THIRD_PARTIES, MAX_THIRD_PARTIES);

      if (filter.inactiveSince) {
        const quiet = await queries.inactiveParties(context.cooperativeId, {
          since: filter.inactiveSince,
          role: filter.type,
        });
        // Never active first, then the longest quiet.
        quiet.sort(
          (a, b) =>
            (a.lastActivity ?? '').localeCompare(b.lastActivity ?? '') ||
            a.name.localeCompare(b.name),
        );
        return listing(quiet, limit, (row) => ({
          ...partyRef(row),
          active: true,
          createdAt: row.createdAt.toISOString().slice(0, 10),
          email: null,
          phone: null,
          lastActivity: row.lastActivity,
        }));
      }

      const rows = await listThirdParties(deps, context, {
        role: filter.type,
        includeInactive: filter.includeInactive,
        createdFrom: filter.createdFrom ? new Date(`${filter.createdFrom}T00:00:00Z`) : undefined,
        createdTo: filter.createdTo
          ? new Date(`${addDays(filter.createdTo, 1)}T00:00:00Z`)
          : undefined,
        newestFirst: true,
      });
      return listing(rows, limit, (row) => ({
        ...partyRef(row),
        active: row.active,
        createdAt: row.createdAt.toISOString().slice(0, 10),
        email: row.email ?? null,
        phone: row.phone ?? null,
      }));
    },

    async tradeByNif(context, nifs, period) {
      const wanted = new Set(nifs);
      const parties = (await listThirdParties(deps, context, { includeInactive: true })).filter(
        (party) => wanted.has(party.nif),
      );
      const totals = async (thirdPartyId: string, operation: Operation) => {
        const { rows } = await queries.invoiceTotals(
          context.cooperativeId,
          { thirdPartyId, operation, from: period.from, to: period.to },
          { groupBy: 'none', limit: 1 },
        );
        return { total: formatMoney(rows[0]?.total ?? 0n), count: rows[0]?.count ?? 0 };
      };
      return Promise.all(
        parties.map(async (party) => ({
          nif: party.nif,
          name: party.name,
          supplier: party.isSupplier,
          customer: party.isCustomer,
          purchases: await totals(party.id, 'purchase'),
          sales: await totals(party.id, 'sale'),
        })),
      );
    },

    async invoiceTotals(
      context,
      { status, thirdParty, settledFrom, settledTo, groupBy, limit, ...filter },
    ) {
      requireRead(context);
      const where = {
        ...filter,
        thirdParty: thirdParty?.trim() || undefined,
        settledFrom,
        settledTo,
        paymentStatus: status,
      };
      const [overall, grouped] = await Promise.all([
        queries.invoiceTotals(context.cooperativeId, where, { groupBy: 'none', limit: 1 }),
        groupBy === 'none'
          ? Promise.resolve({ rows: [] as TotalsGroup[], groups: 0 })
          : queries.invoiceTotals(context.cooperativeId, where, { groupBy, limit }),
      ]);
      return {
        overall: toMoneyTotals(overall.rows[0]),
        groups: grouped.rows.map((row) => ({
          key: row.key ?? '',
          label: row.label,
          ...toMoneyTotals(row),
        })),
        groupCount: grouped.groups,
      };
    },

    async thirdPartySummary(context, text) {
      requireRead(context);
      const found = await listThirdParties(deps, context, { search: text });
      const needle = text.trim().toLowerCase();
      const nif = normalizeNif(text);
      const exact = found.filter((row) => row.nif === nif || row.name.toLowerCase() === needle);
      const chosen = found.length === 1 ? found[0] : exact.length === 1 ? exact[0] : undefined;
      const candidates = found.slice(0, MAX_ROWS).map(partyRef);
      if (!chosen) return { candidates, summary: null };

      const year = deps.today().slice(0, 4);
      const range = { from: `${year}-01-01`, to: `${year}-12-31` };
      const coop = context.cooperativeId;
      const yearTotals = (operation: Operation) =>
        queries.invoiceTotals(
          coop,
          { thirdPartyId: chosen.id, operation, ...range },
          { groupBy: 'none', limit: 1 },
        );
      const [balanceRows, activity, purchases, sales] = await Promise.all([
        deps.invoices.totals(coop, chosen.id),
        queries.partyActivity(coop, chosen.id, range),
        yearTotals('purchase'),
        yearTotals('sale'),
      ]);
      const ofYear = (rows: TotalsGroup[], notes: number) => ({
        invoices: rows[0]?.count ?? 0,
        invoicedTotal: formatMoney(rows[0]?.total ?? 0n),
        deliveryNotes: notes,
      });
      return {
        candidates,
        summary: {
          ...partyRef(chosen),
          toPay: toAmounts(amountsOf(balanceRows, 'purchase')),
          toCollect: toAmounts(amountsOf(balanceRows, 'sale')),
          lastDeliveryNote: activity.lastDeliveryNote,
          lastInvoice: activity.lastInvoice,
          year,
          thisYear: {
            purchases: ofYear(purchases.rows, activity.deliveryNotesInRange.purchase),
            sales: ofYear(sales.rows, activity.deliveryNotesInRange.sale),
          },
        },
      };
    },

    async invoiceDetail(context, { number, operation, thirdParty }) {
      const rows = await listInvoices(deps, context, { number, operation });
      return listing(
        rows.filter((row) => matches(row.thirdParty, thirdParty)),
        MAX_DETAILS,
        toDetail,
      );
    },

    async openDiscrepancies(context, { operation }) {
      const rows = await listInvoices(deps, context, {
        operation,
        reconciliationStatus: 'with_discrepancy',
      });
      // Same meaning as the summary's count: only what is still to pay or collect.
      const open = rows
        .filter((row) => (['pending', 'overdue'] as PaymentStatus[]).includes(row.paymentStatus))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number));
      return listing(open, MAX_ROWS, toDetail);
    },

    async cashForecast(context, { operation, dueFrom, dueTo, granularity }) {
      requireRead(context);
      const due = await queries.dueInvoices(context.cooperativeId, { operation, dueFrom, dueTo });
      const buckets = bucketByDueDate(due, granularity);
      const overall = bucketByDueDate(
        due.map((row) => ({ ...row, dueDate: '2000-01-03' })),
        'month',
      )[0];
      const none = { total: 0n, count: 0, overdueTotal: 0n, overdueCount: 0 };
      return {
        overall: {
          toPay: toFlowView(overall?.toPay ?? none),
          toCollect: toFlowView(overall?.toCollect ?? none),
        },
        buckets: buckets.slice(0, MAX_BUCKETS).map((bucket) => ({
          from: bucket.from,
          to: bucket.to,
          toPay: toFlowView(bucket.toPay),
          toCollect: toFlowView(bucket.toCollect),
        })),
        bucketCount: buckets.length,
      };
    },

    async topItems(context, { source, operation, from, to, concept, groupBy, limit }) {
      requireRead(context);
      const lines = await queries.itemLines(context.cooperativeId, {
        source,
        operation,
        from,
        to,
      });
      const ranking = rankItems(lines, { concept, groupBy, limit });
      return {
        rows: ranking.rows.map((row) => ({
          concept: row.concept,
          unit: row.unit,
          quantity: formatQuantity(row.quantity),
          lines: row.lines,
          ...(row.period && { period: row.period }),
        })),
        total: ranking.total,
        truncated: ranking.truncated,
      };
    },
  };
}
