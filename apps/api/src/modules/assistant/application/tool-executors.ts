import { z } from 'zod';

import {
  DOCUMENT_SEARCH_RESULTS,
  type AnnouncementReads,
  type AssemblyReads,
  type CooperativeContext,
  type FragmentHit,
  type InvoiceDetail,
  type InvoicingReads,
  type MemberAreaReads,
} from './data-sources';
import type { Source } from '../domain/citations';
import type { ToolName } from '../domain/tool-catalog';

/** What a tool found: `data` is for the model; `source`, when present, can be cited (BR-AI-05). */
export interface ToolItem {
  data: Record<string, unknown>;
  source?: Source;
}

export interface ToolOutput {
  items: ToolItem[];
  /** For the model, e.g. a total that is not a record. */
  summary?: Record<string, unknown>;
}

export type ToolExecutor = (context: CooperativeContext, input: unknown) => Promise<ToolOutput>;

/**
 * The other modules, through their public interfaces (BR-AI-02). Every call carries
 * the user's context, so the use case behind it applies their permissions and scope.
 */
export interface DataSources {
  documents: { search(context: CooperativeContext, query: string): Promise<FragmentHit[]> };
  invoicing: InvoicingReads;
  assemblies: AssemblyReads;
  announcements: AnnouncementReads;
  memberArea: MemberAreaReads;
}

const EXCERPT = 300;

const day = z.iso.date().optional();
const operation = z.enum(['purchase', 'sale']).optional();
const paymentStatus = z.enum(['pending', 'overdue', 'settled', 'voided']).optional();
const thirdPartyText = z.string().trim().max(100).optional();

const inputs = {
  search_documents: z.object({ query: z.string().trim().min(3).max(300) }),
  list_invoices: z.object({
    operation,
    status: paymentStatus,
    third_party: thirdPartyText,
    from: day,
    to: day,
    due_from: day,
    due_to: day,
    settled_from: day,
    settled_to: day,
  }),
  list_delivery_notes: z.object({
    operation,
    status: z.enum(['pending_invoicing', 'invoiced', 'voided']).optional(),
    third_party: thirdPartyText,
    from: day,
    to: day,
    sort: z.enum(['newest_first', 'oldest_first']).optional(),
  }),
  invoice_totals: z.object({
    operation,
    status: paymentStatus,
    third_party: thirdPartyText,
    from: day,
    to: day,
    settled_from: day,
    settled_to: day,
    group_by: z.enum(['none', 'third_party', 'month']).default('none'),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  third_party_summary: z.object({ text: z.string().trim().min(2).max(100) }),
  invoice_detail: z.object({
    number: z.string().trim().min(1).max(50),
    operation,
    third_party: thirdPartyText,
  }),
  open_discrepancies: z.object({ operation }),
  cash_forecast: z.object({
    operation,
    due_from: day,
    due_to: day,
    group_by: z.enum(['week', 'month']).default('week'),
  }),
  top_items: z.object({
    source: z.enum(['delivery_notes', 'invoices']).default('delivery_notes'),
    operation,
    from: day,
    to: day,
    concept: z.string().trim().min(1).max(100).optional(),
    group_by: z.enum(['none', 'month']).default('none'),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  payments_and_collections_summary: z.object({}),
  find_third_party: z.object({ text: z.string().trim().min(2).max(100) }),
  list_third_parties: z.object({
    type: z.enum(['supplier', 'customer', 'any']).optional(),
    created_from: day,
    created_to: day,
    include_inactive: z.boolean().default(false),
    inactive_since: day,
    limit: z.number().int().min(1).max(50).default(10),
  }),
  upcoming_assemblies: z.object({}),
  voting_result: z.object({ assembly_id: z.uuid().optional() }),
  latest_announcements: z.object({ n: z.number().int().min(1).max(10).default(5) }),
  my_contributions: z.object({ n: z.number().int().min(1).max(20).default(10) }),
  capital_summary: z.object({ from: day, to: day }),
  member_census: z.object({ from: day, to: day }),
  member_detail: z.object({
    query: z.string().trim().min(1).max(100),
    n: z.number().int().min(1).max(20).default(10),
  }),
  partner_trade: z.object({ from: day, to: day }),
} satisfies Record<ToolName, z.ZodType>;

/** The model sent something the tool cannot use; it can fix it and try again. */
export class InvalidToolInputError extends Error {
  constructor(tool: string, issues: string) {
    super(`Invalid input for ${tool}: ${issues}`);
    this.name = 'InvalidToolInputError';
  }
}

function parse<N extends ToolName>(name: N, input: unknown): z.infer<(typeof inputs)[N]> {
  const result = (inputs[name] as z.ZodType).safeParse(input ?? {});
  if (!result.success) {
    throw new InvalidToolInputError(
      name,
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  return result.data as z.infer<(typeof inputs)[N]>;
}

/** Tools are read-only (BR-AI-03): none of them calls anything but a read of its module. */
export function createToolExecutors(src: DataSources): Record<ToolName, ToolExecutor> {
  return {
    async search_documents(context, raw) {
      const { query } = parse('search_documents', raw);
      const hits = await src.documents.search(context, query);
      return {
        items: hits.slice(0, DOCUMENT_SEARCH_RESULTS).map((hit) => ({
          data: {
            document: hit.title,
            category: hit.category,
            page: hit.page,
            text: hit.context ?? hit.content,
          },
          source: {
            kind: 'document',
            resourceId: hit.documentId,
            title: hit.title,
            page: hit.page,
            versionId: hit.versionId,
            excerpt: hit.content.slice(0, EXCERPT),
          },
        })),
      };
    },

    async list_invoices(context, raw) {
      const input = parse('list_invoices', raw);
      const rows = await src.invoicing.invoices(context, {
        operation: input.operation,
        status: input.status,
        thirdParty: input.third_party,
        from: input.from,
        to: input.to,
        dueFrom: input.due_from,
        dueTo: input.due_to,
        settledFrom: input.settled_from,
        settledTo: input.settled_to,
      });
      return {
        items: rows.rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record('invoice', row.id, `Invoice ${row.number} · ${row.thirdParty}`),
        })),
        summary: listSummary(rows),
      };
    },

    async list_delivery_notes(context, raw) {
      const input = parse('list_delivery_notes', raw);
      const rows = await src.invoicing.deliveryNotes(context, {
        operation: input.operation,
        status: input.status,
        thirdParty: input.third_party,
        from: input.from,
        to: input.to,
        sort: input.sort,
      });
      return {
        items: rows.rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record(
            'delivery_note',
            row.id,
            `Delivery note ${row.number} · ${row.thirdParty}`,
          ),
        })),
        summary: listSummary(rows),
      };
    },

    async invoice_totals(context, raw) {
      const input = parse('invoice_totals', raw);
      const result = await src.invoicing.invoiceTotals(context, {
        operation: input.operation,
        status: input.status,
        thirdParty: input.third_party,
        from: input.from,
        to: input.to,
        settledFrom: input.settled_from,
        settledTo: input.settled_to,
        groupBy: input.group_by,
        limit: input.limit,
      });
      const { groupCount } = result;
      return {
        items: result.groups.map(({ key, label, ...totals }) => ({
          data:
            input.group_by === 'month'
              ? { month: key, ...totals }
              : { thirdParty: label, ...totals },
          // A ranked third party can be cited; a month cannot.
          source:
            input.group_by === 'third_party' ? record('third_party', key, label ?? key) : undefined,
        })),
        summary: {
          overall: result.overall,
          ...(input.group_by !== 'none' && {
            groupBy: input.group_by,
            ...listSummary({ rows: result.groups, total: groupCount }),
          }),
        },
      };
    },

    async third_party_summary(context, raw) {
      const { text } = parse('third_party_summary', raw);
      const { candidates, summary } = await src.invoicing.thirdPartySummary(context, text);
      if (summary) {
        const { id, ...data } = summary;
        return { items: [{ data, source: record('third_party', id, summary.name) }] };
      }
      return {
        items: candidates.map((row) => ({
          data: { ...row, id: undefined },
          source: record('third_party', row.id, row.name),
        })),
        summary:
          candidates.length > 1
            ? { note: 'Several third parties match: tell the user and ask which one they mean.' }
            : undefined,
      };
    },

    async invoice_detail(context, raw) {
      const input = parse('invoice_detail', raw);
      const rows = await src.invoicing.invoiceDetail(context, {
        number: input.number,
        operation: input.operation,
        thirdParty: input.third_party,
      });
      return {
        items: rows.rows.map(invoiceItem),
        summary: rows.total > 1 ? listSummary(rows) : undefined,
      };
    },

    async open_discrepancies(context, raw) {
      const input = parse('open_discrepancies', raw);
      const rows = await src.invoicing.openDiscrepancies(context, { operation: input.operation });
      return { items: rows.rows.map(invoiceItem), summary: listSummary(rows) };
    },

    async cash_forecast(context, raw) {
      const input = parse('cash_forecast', raw);
      const result = await src.invoicing.cashForecast(context, {
        operation: input.operation,
        dueFrom: input.due_from,
        dueTo: input.due_to,
        granularity: input.group_by,
      });
      return {
        items: result.buckets.map((bucket) => ({ data: { ...bucket } })),
        summary: {
          overall: result.overall,
          ...listSummary({ rows: result.buckets, total: result.bucketCount }),
        },
      };
    },

    async top_items(context, raw) {
      const input = parse('top_items', raw);
      const result = await src.invoicing.topItems(context, {
        source: input.source,
        operation: input.operation,
        from: input.from,
        to: input.to,
        concept: input.concept,
        groupBy: input.group_by,
        limit: input.limit,
      });
      return {
        items: result.rows.map((row) => ({ data: { ...row } })),
        summary: { distinctItems: result.total, truncated: result.truncated },
      };
    },

    async payments_and_collections_summary(context, raw) {
      parse('payments_and_collections_summary', raw);
      const summary = await src.invoicing.summary(context);
      return { items: [], summary: { ...summary } };
    },

    async find_third_party(context, raw) {
      const { text } = parse('find_third_party', raw);
      const rows = await src.invoicing.findThirdParties(context, text);
      return {
        items: rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record('third_party', row.id, row.name),
        })),
      };
    },

    async list_third_parties(context, raw) {
      const input = parse('list_third_parties', raw);
      const rows = await src.invoicing.listThirdParties(context, {
        type: input.type === 'any' ? undefined : input.type,
        createdFrom: input.created_from,
        createdTo: input.created_to,
        includeInactive: input.include_inactive,
        inactiveSince: input.inactive_since,
        limit: input.limit,
      });
      return {
        items: rows.rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record('third_party', row.id, row.name),
        })),
        summary: listSummary(rows),
      };
    },

    async upcoming_assemblies(context, raw) {
      parse('upcoming_assemblies', raw);
      const rows = await src.assemblies.upcoming(context);
      return {
        items: rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record(
            'assembly',
            row.id,
            `Assembly ${row.firstCallAt.slice(0, 10)} · ${row.place}`,
          ),
        })),
      };
    },

    async voting_result(context, raw) {
      const { assembly_id } = parse('voting_result', raw);
      const rows = await src.assemblies.votingResults(context, assembly_id);
      return {
        items: rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record('assembly', row.id, `Assembly ${row.firstCallAt.slice(0, 10)}`),
        })),
      };
    },

    async latest_announcements(context, raw) {
      const { n } = parse('latest_announcements', raw);
      const rows = await src.announcements.latest(context, n);
      return {
        items: rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record('announcement', row.id, row.title),
        })),
      };
    },

    /** Always the caller's own capital: the use case reads their membership, whatever the scope. */
    async my_contributions(context, raw) {
      const { n } = parse('my_contributions', raw);
      const mine = await src.memberArea.myContributions(context, n);
      const { latestMovements, ...summary } = mine;
      return { items: latestMovements.map((movement) => ({ data: { ...movement } })), summary };
    },

    /** Other members' data: the member area use case refuses a profile without "all" scope (403). */
    async capital_summary(context, raw) {
      const period = parse('capital_summary', raw);
      const { period: movements, ...totals } = await src.memberArea.capitalSummary(context, period);
      return { items: [], summary: { ...totals, ...movements } };
    },

    async member_census(context, raw) {
      const period = parse('member_census', raw);
      return { items: [], summary: { ...(await src.memberArea.census(context, period)) } };
    },

    async member_detail(context, raw) {
      const { query, n } = parse('member_detail', raw);
      const matches = await src.memberArea.memberDetail(context, query, n);
      return {
        items: matches.map(({ latestMovements, ...partner }) => ({
          data: { ...partner, ...(latestMovements && { latestMovements }) },
        })),
        summary: { matches: matches.length },
      };
    },

    /**
     * Members x third parties by NIF (ADR-025): the partners come from the member area and the
     * trade from invoicing, each through its public read and with the user's permissions.
     */
    async partner_trade(context, raw) {
      const period = parse('partner_trade', raw);
      const partners = await src.memberArea.partnersWithNif(context);
      const trades = partners.length
        ? await src.invoicing.tradeByNif(
            context,
            partners.map((partner) => partner.nif),
            period,
          )
        : [];
      const byNif = new Map(partners.map((partner) => [partner.nif, partner]));
      const items = trades.map((trade) => {
        const partner = byNif.get(trade.nif)!;
        return {
          data: {
            partner: partner.name,
            partnerNumber: partner.partnerNumber,
            nif: trade.nif,
            registeredAs: trade.name,
            supplier: trade.supplier,
            customer: trade.customer,
            purchases: trade.purchases,
            sales: trade.sales,
          },
        };
      });
      return {
        items,
        summary: {
          partnersWithNif: partners.length,
          partnersAlsoThirdParties: trades.length,
          purchasesTotal: sumMoney(trades.map((trade) => trade.purchases.total)),
          salesTotal: sumMoney(trades.map((trade) => trade.sales.total)),
          from: period.from ?? null,
          to: period.to ?? null,
        },
      };
    },
  };
}

/** Exact sum of euro amounts given as decimal strings ("12.50"): integer cents, never floats. */
function sumMoney(amounts: readonly string[]): string {
  const cents = amounts.reduce((sum, amount) => {
    const [whole = '0', fraction = ''] = amount.split('.');
    const value = BigInt(whole.replace('-', '')) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
    return sum + (whole.startsWith('-') ? -value : value);
  }, 0n);
  const abs = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** How many matched and whether the list was cut, so the answer can say "muestro X de N". */
function listSummary(listing: { rows: unknown[]; total: number }): Record<string, unknown> {
  const truncated = listing.total > listing.rows.length;
  return {
    total: listing.total,
    truncated,
    ...(truncated && {
      note: `Only ${listing.rows.length} of ${listing.total} are shown: tell the user "muestro ${listing.rows.length} de ${listing.total}".`,
    }),
  };
}

const EXPLANATION_NOTE =
  'The numeric detail governs; the explanation is drafted by an AI and only indicative: give the numbers first and say it is "orientativa".';

/** An invoice with its lines and differences: numbers first, the AI explanation last (BR-INV-12). */
function invoiceItem(row: InvoiceDetail): ToolItem {
  const { id, discrepancies, ...header } = row;
  return {
    data: {
      ...header,
      discrepancies: discrepancies.map(({ explanation, ...numbers }) => ({
        ...numbers,
        ...(explanation && { explanation }),
      })),
      ...(discrepancies.some((d) => d.explanation) && { explanationNote: EXPLANATION_NOTE }),
    },
    source: record('invoice', id, `Invoice ${row.number} · ${row.thirdParty}`),
  };
}

function record(kind: Source['kind'], resourceId: string, title: string): Source {
  return { kind, resourceId, title, page: null, versionId: null, excerpt: null };
}
