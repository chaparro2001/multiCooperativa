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
import { PERIODS, rangeFor, resolvePeriodText, type DateRange } from '../domain/period';
import type { ToolName } from '../domain/tool-catalog';

/** What a tool found: `data` is for the model; `source`, when present, can be cited (BR-AI-05). */
export interface ToolItem {
  data: Record<string, unknown>;
  source?: Source;
}

/**
 * Records behind a computed figure (a total, a ranking), so the answer can cite them like a
 * document: at most EVIDENCE of them, and how many more there are (BR-AI-05).
 */
export interface Evidence {
  sources: Source[];
  more: number;
}

export interface ToolOutput {
  items: ToolItem[];
  evidence?: Evidence;
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
/** Sources shown per computed figure; the rest is reported as "and N more". */
const EVIDENCE = 5;

const day = z.iso.date().optional();
const operation = z.enum(['purchase', 'sale']).optional();
/** A relative period, a named month, YYYY-MM or YYYY; the server resolves it (requirements/07, 3.1). */
const period = z
  .string()
  .trim()
  .max(30)
  .refine((value) => resolvePeriodText(value, '2000-01-01') !== null, {
    message: `unknown period; use one of ${PERIODS.join(', ')}, a month name (september), YYYY-MM or YYYY`,
  })
  .optional();
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
    period,
    date: z.enum(['issued', 'due', 'settled']).optional(),
  }),
  list_delivery_notes: z.object({
    operation,
    status: z.enum(['pending_invoicing', 'invoiced', 'voided']).optional(),
    third_party: thirdPartyText,
    from: day,
    to: day,
    period,
    sort: z.enum(['newest_first', 'oldest_first']).optional(),
  }),
  invoice_totals: z.object({
    operation,
    status: paymentStatus,
    third_party: thirdPartyText,
    from: day,
    to: day,
    period,
    date: z.enum(['issued', 'settled']).optional(),
    group_by: z.enum(['none', 'third_party', 'month']).default('none'),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  invoice_detail: z.object({
    number: z.string().trim().min(1).max(50),
    operation,
    third_party: thirdPartyText,
  }),
  open_discrepancies: z.object({ operation }),
  cash_forecast: z.object({
    operation,
    from: day,
    to: day,
    period,
    group_by: z.enum(['week', 'month']).default('week'),
  }),
  top_items: z.object({
    source: z.enum(['delivery_notes', 'invoices']).default('delivery_notes'),
    operation,
    from: day,
    to: day,
    period,
    concept: z.string().trim().min(1).max(100).optional(),
    group_by: z.enum(['none', 'month']).default('none'),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  payments_and_collections_summary: z.object({}),
  find_third_party: z.object({ text: z.string().trim().min(2).max(100) }),
  list_third_parties: z.object({
    type: z.enum(['supplier', 'customer', 'any']).optional(),
    from: day,
    to: day,
    period,
    include_inactive: z.boolean().default(false),
    inactive_since: day,
    limit: z.number().int().min(1).max(50).default(10),
  }),
  upcoming_assemblies: z.object({}),
  voting_result: z.object({ assembly_id: z.uuid().optional() }),
  latest_announcements: z.object({ n: z.number().int().min(1).max(10).default(5) }),
  my_contributions: z.object({ n: z.number().int().min(1).max(20).default(10) }),
  partners_summary: z.object({ from: day, to: day, period }),
  member_detail: z.object({
    query: z.string().trim().min(1).max(100),
    n: z.number().int().min(1).max(20).default(10),
  }),
  partner_trade: z.object({ from: day, to: day, period }),
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
export function createToolExecutors(
  src: DataSources,
  /** The cooperative's calendar day (YYYY-MM-DD) that relative periods are resolved against. */
  today: () => string = () => new Date().toISOString().slice(0, 10),
): Record<ToolName, ToolExecutor> {
  /** Cites up to EVIDENCE of the invoices behind a figure of `count` invoices. */
  async function invoiceEvidence(
    context: CooperativeContext,
    filter: Parameters<InvoicingReads['invoices']>[1],
    count: number,
  ): Promise<{ evidence?: Evidence; shown: InvoiceRow[] }> {
    if (count === 0) return { shown: [] };
    const { rows } = await src.invoicing.invoices(context, filter);
    const shown = rows
      .filter((row) => filter.status === 'voided' || row.paymentStatus !== 'voided')
      .slice(0, EVIDENCE);
    return { evidence: evidenceOf(shown.map(invoiceSource), count), shown };
  }

  /** Delivery notes (or invoices) whose lines add up to a top_items figure. */
  async function itemEvidence(
    context: CooperativeContext,
    input: z.infer<(typeof inputs)['top_items']>,
  ): Promise<Evidence | undefined> {
    const { operation, from, to, concept } = input;
    if (input.source === 'invoices') {
      // Invoice listings do not carry lines: with a concept filter we cannot tell which invoices count.
      if (concept) return undefined;
      const { rows, total } = await src.invoicing.invoices(context, { operation, from, to });
      const live = rows.filter((row) => row.paymentStatus !== 'voided');
      return evidenceOf(
        live
          .slice(0, EVIDENCE)
          .map((row) => record('invoice', row.id, `Invoice ${row.number} · ${row.thirdParty}`)),
        Math.max(total - rows.length + live.length, 0),
      );
    }
    const { rows, total } = await src.invoicing.deliveryNotes(context, { operation, from, to });
    const needle = concept ? plain(concept) : undefined;
    const matching = rows.filter(
      (row) =>
        row.status !== 'voided' &&
        (!needle || row.lines.some((line) => plain(line.concept).includes(needle))),
    );
    return evidenceOf(
      matching
        .slice(0, EVIDENCE)
        .map((row) =>
          record('delivery_note', row.id, `Delivery note ${row.number} · ${row.thirdParty}`),
        ),
      needle ? matching.length : Math.max(total - rows.length + matching.length, 0),
    );
  }

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
      const { dates, range } = invoiceDates(input, today());
      const rows = await src.invoicing.invoices(context, {
        operation: input.operation,
        status: input.status,
        thirdParty: input.third_party,
        ...dates,
      });
      return {
        items: rows.rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record('invoice', row.id, `Invoice ${row.number} · ${row.thirdParty}`),
        })),
        summary: { ...periodOut(range), ...listSummary(rows) },
      };
    },

    async list_delivery_notes(context, raw) {
      const input = parse('list_delivery_notes', raw);
      const range = rangeFor(input.period, input, today());
      const { from, to } = range;
      const rows = await src.invoicing.deliveryNotes(context, {
        operation: input.operation,
        status: input.status,
        thirdParty: input.third_party,
        from,
        to,
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
        summary: { ...periodOut(range), ...listSummary(rows) },
      };
    },

    async invoice_totals(context, raw) {
      const input = parse('invoice_totals', raw);
      const { dates, range } = invoiceDates(input, today());
      const filter = {
        operation: input.operation,
        status: input.status,
        thirdParty: input.third_party,
        from: dates.from,
        to: dates.to,
        settledFrom: dates.settledFrom,
        settledTo: dates.settledTo,
      };
      const result = await src.invoicing.invoiceTotals(context, {
        ...filter,
        groupBy: input.group_by,
        limit: input.limit,
      });
      const { groupCount, overall } = result;
      // Ranked third parties are the sources themselves; any other figure cites its invoices.
      const { evidence, shown } =
        input.group_by === 'third_party'
          ? { evidence: undefined, shown: [] }
          : await invoiceEvidence(context, filter, overall.count);
      const invoices = overall.count === 1 ? 'factura' : 'facturas';
      return {
        evidence,
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
          ...periodEcho(range),
          // The figure as one phrase to repeat, dates and invoices included. It is the only form
          // of a single total: given the numbers twice, a small model picks the bare total.
          text: sentence(range, [
            `${overall.count} ${invoices}${numbersOf(shown, overall.count)}`,
            `base ${overall.base}, IVA ${overall.vatAmount}, total ${overall.total}`,
          ]),
          ...(input.group_by !== 'none' && {
            overall,
            groupBy: input.group_by,
            ...listSummary({ rows: result.groups, total: groupCount }),
          }),
        },
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
      const range = rangeFor(input.period, input, today());
      const { from: dueFrom, to: dueTo } = range;
      const result = await src.invoicing.cashForecast(context, {
        operation: input.operation,
        dueFrom,
        dueTo,
        granularity: input.group_by,
      });
      // The invoices behind the figure: pending and overdue ones, the soonest to fall due first.
      const open = await Promise.all(
        (['overdue', 'pending'] as const).map((status) =>
          src.invoicing.invoices(context, { operation: input.operation, status, dueFrom, dueTo }),
        ),
      );
      const count = result.overall.toPay.count + result.overall.toCollect.count;
      const soonest = open
        .flatMap(({ rows }) => rows)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number.localeCompare(b.number))
        .slice(0, EVIDENCE);
      const { toPay, toCollect } = result.overall;
      // A range from today on leaves out what is already overdue, which is still cash to move:
      // it is said apart, exact (every overdue invoice fell due before today).
      const overdueBefore =
        dueFrom && dueFrom >= today()
          ? await Promise.all(
              (['purchase', 'sale'] as const)
                .filter((operation) => !input.operation || input.operation === operation)
                .map(async (operation) => {
                  const { overall } = await src.invoicing.invoiceTotals(context, {
                    operation,
                    status: 'overdue',
                    groupBy: 'none',
                    limit: 1,
                  });
                  return `${operation === 'purchase' ? 'a pagar' : 'a cobrar'} ${overall.total} (${overall.count})`;
                }),
            )
          : [];
      return {
        items: result.buckets.map((bucket) => ({ data: { ...bucket } })),
        evidence: count === 0 ? undefined : evidenceOf(soonest.map(invoiceSource), count),
        summary: {
          ...periodEcho(range),
          text: sentence(range, [
            `a pagar ${toPay.total} (${toPay.count}, vencido ${toPay.overdueTotal})`,
            `a cobrar ${toCollect.total} (${toCollect.count}, vencido ${toCollect.overdueTotal})`,
            ...(soonest.length
              ? [
                  `primeras: ${soonest.map((row) => `${row.number} ${row.total} vence ${row.dueDate}`).join(', ')}${count > soonest.length ? ` y ${count - soonest.length} más` : ''}`,
                ]
              : []),
            ...(overdueBefore.length
              ? [`además, ya vencido antes y sin liquidar: ${overdueBefore.join(', ')}`]
              : []),
          ]),
          ...listSummary({ rows: result.buckets, total: result.bucketCount }),
        },
      };
    },

    async top_items(context, raw) {
      const input = parse('top_items', raw);
      const range = rangeFor(input.period, input, today());
      const { from, to } = range;
      const result = await src.invoicing.topItems(context, {
        source: input.source,
        operation: input.operation,
        from,
        to,
        concept: input.concept,
        groupBy: input.group_by,
        limit: input.limit,
      });
      // Nothing added up, nothing to cite.
      const evidence = result.rows.length
        ? await itemEvidence(context, { ...input, from, to })
        : undefined;
      return {
        items: result.rows.map((row) => ({ data: { ...row } })),
        evidence,
        summary: {
          ...periodOut(range),
          distinctItems: result.total,
          truncated: result.truncated,
        },
      };
    },

    async payments_and_collections_summary(context, raw) {
      parse('payments_and_collections_summary', raw);
      const summary = await src.invoicing.summary(context);
      return { items: [], summary: { ...summary } };
    },

    /** One supplier or customer with its situation; several matches come back as a list to pick. */
    async find_third_party(context, raw) {
      const { text } = parse('find_third_party', raw);
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

    async list_third_parties(context, raw) {
      const input = parse('list_third_parties', raw);
      const created = rangeFor(input.period, input, today());
      const rows = await src.invoicing.listThirdParties(context, {
        type: input.type === 'any' ? undefined : input.type,
        createdFrom: created.from,
        createdTo: created.to,
        includeInactive: input.include_inactive,
        inactiveSince: input.inactive_since,
        limit: input.limit,
      });
      return {
        items: rows.rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record('third_party', row.id, row.name),
        })),
        summary: {
          ...periodOut(created),
          // A list of quiet ones reads like "none were quiet" to a small model unless it is said.
          ...(input.inactive_since && {
            text: `Sin actividad desde el ${input.inactive_since}: ${rows.rows.map((row) => row.name).join(', ') || 'ninguno'}`,
          }),
          ...listSummary(rows),
        },
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
    async partners_summary(context, raw) {
      const input = parse('partners_summary', raw);
      const range = rangeFor(input.period, input, today());
      const { from, to } = range;
      const [capital, census] = await Promise.all([
        src.memberArea.capitalSummary(context, { from, to }),
        src.memberArea.census(context, { from, to }),
      ]);
      const { period: movements, ...totals } = capital;
      const { period: _bounds, ...heads } = census;
      const bounded = Boolean(from || to);
      return {
        items: [],
        summary: {
          ...periodOut(range),
          text: [
            `Capital social ${totals.totalCapital} de ${totals.partners} socios; ${heads.activePartners} activos, ${heads.suspendedPartners} suspendidos, ${heads.invitedNotActivated} invitados sin activar`,
            bounded
              ? sentence(range, [
                  `${heads.joinedInPeriod ?? 0} altas, ${heads.leftInPeriod ?? 0} bajas`,
                  `aportaciones ${movements.contributions}, devoluciones ${movements.refunds}`,
                ])
              : `en toda la historia: aportaciones ${movements.contributions}, devoluciones ${movements.refunds}`,
          ].join('. '),
          ...totals,
          ...heads,
          contributions: movements.contributions,
          refunds: movements.refunds,
          corrections: movements.corrections,
        },
      };
    },

    async member_detail(context, raw) {
      const { query, n } = parse('member_detail', raw);
      const matches = await src.memberArea.memberDetail(context, query, n);
      return {
        items: matches.map(({ latestMovements, ...partner }) => ({
          data: {
            // Who it is and how much, as one phrase: the answer must identify the partner.
            text: `${partner.name} (socio ${partner.partnerNumber ?? 'sin número'}, NIF ${partner.nif ?? 'sin NIF'}): capital ${partner.capital}`,
            ...partner,
            ...(latestMovements && { latestMovements }),
          },
        })),
        summary: { matches: matches.length },
      };
    },

    /**
     * Members x third parties by NIF (ADR-025): the partners come from the member area and the
     * trade from invoicing, each through its public read and with the user's permissions.
     */
    async partner_trade(context, raw) {
      const input = parse('partner_trade', raw);
      const range = rangeFor(input.period, input, today());
      const { from, to } = range;
      const partners = await src.memberArea.partnersWithNif(context);
      const trades = partners.length
        ? await src.invoicing.tradeByNif(
            context,
            partners.map((partner) => partner.nif),
            { from, to },
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
        // The third parties behind the figures; the partners' own records are not cited (no
        // route for them under the invoicing permission).
        evidence: evidenceOf(
          trades.slice(0, EVIDENCE).map((trade) => record('third_party', trade.id, trade.name)),
          trades.length,
        ),
        summary: {
          ...periodOut(range),
          partnersWithNif: partners.length,
          partnersAlsoThirdParties: trades.length,
          purchasesTotal: sumMoney(trades.map((trade) => trade.purchases.total)),
          salesTotal: sumMoney(trades.map((trade) => trade.sales.total)),
        },
      };
    },
  };
}

const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** The sources of a figure and how many more records stand behind it than are cited. */
function evidenceOf(sources: Source[], count: number): Evidence | undefined {
  return sources.length ? { sources, more: Math.max(count - sources.length, 0) } : undefined;
}

/** Only the resolved dates, for results whose `text` already says them. */
const periodEcho = (range: { period?: DateRange }) =>
  range.period ? { period: { from: range.period.from, to: range.period.to } } : {};

/**
 * The dates the server resolved from a period, for the answer to state them, and the phrase
 * that says them (also for explicit from/to), ready to quote: a small model then repeats it
 * instead of describing the period in its own words.
 */
function periodOut(range: { from?: string; to?: string; period?: DateRange }) {
  const text =
    range.from && range.to
      ? `del ${range.from} al ${range.to}`
      : range.from
        ? `desde el ${range.from}`
        : range.to
          ? `hasta el ${range.to}`
          : undefined;
  return {
    ...(range.period && { period: { from: range.period.from, to: range.period.to } }),
    ...(text && { periodText: text }),
  };
}

/**
 * The date filters of an invoice tool: from/to, or the period, apply to the date chosen by
 * `date` (by default the settlement date for settled invoices, the issue date otherwise);
 * explicit dates win over the period.
 */
function invoiceDates(
  input: {
    period?: Parameters<typeof rangeFor>[0];
    date?: 'issued' | 'due' | 'settled';
    status?: string;
    from?: string;
    to?: string;
  },
  today: string,
) {
  const range = rangeFor(input.period, input, today);
  // "Facturas pagadas en septiembre" means paid in September: settled ones go by settlement date.
  const chosen = input.date ?? (input.status === 'settled' ? 'settled' : 'issued');
  const on = (date: typeof chosen) => (chosen === date ? range : {});
  return {
    range,
    dates: {
      from: on('issued').from,
      to: on('issued').to,
      dueFrom: on('due').from,
      dueTo: on('due').to,
      settledFrom: on('settled').from,
      settledTo: on('settled').to,
    },
  };
}

type InvoiceRow = Awaited<ReturnType<InvoicingReads['invoices']>>['rows'][number];

const invoiceSource = (row: InvoiceRow) =>
  record('invoice', row.id, `Invoice ${row.number} · ${row.thirdParty}`);

/** " (F-1, F-2 y 3 más)": the invoices behind a figure, by number. */
function numbersOf(rows: readonly InvoiceRow[], count: number): string {
  if (!rows.length) return '';
  const more = count > rows.length ? ` y ${count - rows.length} más` : '';
  return ` (${rows.map((row) => row.number).join(', ')}${more})`;
}

/**
 * A result as one Spanish phrase, its dates first ("del 2026-10-01 al 2026-12-31: ..."): a small
 * model repeats a phrase it is given far more faithfully than it composes one from JSON fields.
 */
function sentence(range: { from?: string; to?: string }, parts: string[]): string {
  const when = periodOut(range).periodText;
  const text = parts.join('; ');
  return when ? `${when[0]!.toUpperCase()}${when.slice(1)}: ${text}` : text;
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
  'Give each discrepancy "text" first; the explanation is drafted by an AI: say it is "orientativa".';

/** An invoice with its lines and differences: numbers first, the AI explanation last (BR-INV-12). */
function invoiceItem(row: InvoiceDetail): ToolItem {
  const { id, discrepancies, ...header } = row;
  return {
    data: {
      ...header,
      discrepancies: discrepancies.map(({ explanation, ...numbers }) => ({
        ...numbers,
        // The numbers as one phrase to quote: a small model otherwise gives only the difference.
        text: `${numbers.concept}: entregado ${numbers.deliveredQuantity} ${numbers.unit}, facturado ${numbers.invoicedQuantity} ${numbers.unit}, diferencia ${numbers.difference} ${numbers.unit}`,
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
