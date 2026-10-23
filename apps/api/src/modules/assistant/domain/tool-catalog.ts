/** Modules whose data the assistant can read. */
export type ToolModule = 'documents' | 'invoicing' | 'assemblies' | 'announcements' | 'member-area';

export interface ToolSpec {
  readonly name: ToolName;
  /** What the model reads to decide when to call it. */
  readonly description: string;
  /** JSON Schema of the input. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
  /** BR-AI-01: the tool exists for a user only if their profile has this. BR-AI-03: always read. */
  readonly requires: ToolRequirement;
  /** Further permissions the tool needs besides `requires` (a tool that crosses two modules). */
  readonly alsoRequires?: readonly ToolRequirement[];
}

/**
 * `scope: 'all'` is for the member area: the tool reads other members' data, so a profile with
 * only "own" scope does not get it (ADR-025).
 */
export interface ToolRequirement {
  readonly module: ToolModule;
  readonly level: 'read';
  readonly scope?: 'all';
}

export const TOOL_NAMES = [
  'search_documents',
  'list_invoices',
  'invoice_totals',
  'invoice_detail',
  'open_discrepancies',
  'payments_and_collections_summary',
  'cash_forecast',
  'list_delivery_notes',
  'top_items',
  'find_third_party',
  'list_third_parties',
  'upcoming_assemblies',
  'voting_result',
  'latest_announcements',
  'my_contributions',
  'partners_summary',
  'member_detail',
  'partner_trade',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/*
 * The catalog goes into every model call, and a small local model reads it on CPU: every word
 * costs latency and attention. Descriptions say when to use a tool and what is not obvious;
 * the rules that apply to all tools (periods, citations, "muestro X de N") are said once, in
 * the system prompt. Parameters are shared definitions without descriptions where the name
 * and the enum say it all.
 */
const day = { type: 'string', description: 'YYYY-MM-DD' } as const;
/**
 * The server turns it into dates (requirements/07, section 3.1): the model does no arithmetic.
 * No enum: the values are listed once in the system prompt, and the server also takes month
 * names, so "en septiembre" needs no dates either.
 */
const period = { type: 'string', description: 'this_month, last_year, september...' } as const;
const range = { from: day, to: day, period } as const;
const operation = {
  type: 'string',
  enum: ['purchase', 'sale'],
  description: 'purchase: suppliers, sale: customers. Only if the question names one side',
} as const;
const paymentStatus = {
  type: 'string',
  enum: ['pending', 'overdue', 'settled', 'voided'],
  description:
    'overdue = past due and unpaid ("vencidas"), never for "vencen"; pending excludes overdue',
} as const;
const thirdParty = { type: 'string', description: 'name or NIF' } as const;
const limit = (max: number) => ({ type: 'integer', minimum: 1, maximum: max }) as const;
const object = (properties: Record<string, unknown>, required?: string[]) => ({
  type: 'object',
  properties,
  ...(required && { required }),
  additionalProperties: false,
});

const invoicing = { module: 'invoicing', level: 'read' } as const;
const othersInMemberArea = { module: 'member-area', level: 'read', scope: 'all' } as const;

/**
 * Requirements/07, section 3. The order is the order the model sees them.
 */
export const TOOL_CATALOG: readonly ToolSpec[] = [
  {
    name: 'search_documents',
    description:
      "Searches the cooperative's documents (bylaws, regulations, minutes, accounts) and returns the most relevant fragments.",
    inputSchema: object(
      {
        query: {
          type: 'string',
          description: 'In Spanish, standalone: name the subject, also in a follow-up.',
        },
      },
      ['query'],
    ),
    requires: { module: 'documents', level: 'read' },
  },
  {
    name: 'list_invoices',
    description:
      'Lists invoices: number, third party, dates, amounts, payment status, settlement date. For "qué facturas...": "vencen esta semana" -> period this_week, date due, no status; "vencidas" -> status overdue; "se pagaron el mes pasado" -> operation purchase, status settled, period last_month ("se cobraron": sale).',
    inputSchema: object({
      operation,
      status: paymentStatus,
      third_party: thirdParty,
      ...range,
      date: {
        type: 'string',
        enum: ['issued', 'due', 'settled'],
        description:
          'Date that from/to/period filter: due for "vencen", settled for "se pagaron" (default: settled if status is settled, else issued)',
      },
    }),
    requires: invoicing,
  },
  {
    name: 'invoice_totals',
    description:
      'Adds up invoices in the database: count, base, VAT, total. For "cuánto", "cuántas" and rankings: group_by third_party ranks suppliers or customers by total (top 5 suppliers this year: operation purchase, period this_year, group_by third_party, limit 5); month gives one row per month. Voided ones excluded.',
    inputSchema: object({
      operation,
      status: paymentStatus,
      third_party: thirdParty,
      ...range,
      date: {
        type: 'string',
        enum: ['issued', 'settled'],
        description: 'settled: by payment date (default when status is settled)',
      },
      group_by: { type: 'string', enum: ['none', 'third_party', 'month'] },
      limit: limit(25),
    }),
    requires: invoicing,
  },
  {
    name: 'invoice_detail',
    description:
      'One invoice by number: amounts, payment, lines, delivery notes and differences against them.',
    inputSchema: object(
      { number: { type: 'string', description: 'e.g. F-77' }, operation, third_party: thirdParty },
      ['number'],
    ),
    requires: invoicing,
  },
  {
    name: 'open_discrepancies',
    description:
      'Unsettled invoices whose quantities differ from their delivery notes, with delivered, invoiced and difference per concept.',
    inputSchema: object({ operation }),
    requires: invoicing,
  },
  {
    name: 'payments_and_collections_summary',
    description:
      'Totals still to pay to suppliers and to collect from customers now (pending includes overdue), open discrepancies and stale delivery notes.',
    inputSchema: object({}),
    requires: invoicing,
  },
  {
    name: 'cash_forecast',
    description:
      'Cash forecast: what is still to pay and to collect, in week or month buckets by due date; from/to/period are due dates, and without them it covers everything pending ("las próximas semanas"). Each total includes its overdue part.',
    // No operation: every result already splits what is to pay and what is to collect.
    inputSchema: object({ ...range, group_by: { type: 'string', enum: ['week', 'month'] } }),
    requires: invoicing,
  },
  {
    name: 'list_delivery_notes',
    description:
      'Lists delivery notes with lines and invoicing status; pending ones carry ageDays. Oldest pending: status pending_invoicing, sort oldest_first.',
    inputSchema: object({
      operation,
      status: { type: 'string', enum: ['pending_invoicing', 'invoiced', 'voided'] },
      third_party: thirdParty,
      ...range,
      sort: { type: 'string', enum: ['newest_first', 'oldest_first'] },
    }),
    requires: invoicing,
  },
  {
    name: 'top_items',
    description:
      'Products or concepts bought or sold most: quantities added per concept and unit, highest first. With concept and group_by month: its monthly evolution.',
    inputSchema: object({
      source: { type: 'string', enum: ['delivery_notes', 'invoices'] },
      operation,
      ...range,
      concept: { type: 'string', description: 'product, e.g. aceite' },
      group_by: { type: 'string', enum: ['none', 'month'] },
      limit: limit(25),
    }),
    requires: invoicing,
  },
  {
    name: 'find_third_party',
    description:
      'A supplier or customer by name or NIF: its data, what is pending or overdue with it, last delivery note and invoice, this year. Several matches: the list.',
    inputSchema: object({ text: thirdParty }, ['text']),
    requires: invoicing,
  },
  {
    name: 'list_third_parties',
    description:
      'Lists suppliers and customers, newest registered first (from/to/period: registration date). inactive_since: those with no activity since that date.',
    inputSchema: object({
      type: { type: 'string', enum: ['supplier', 'customer', 'any'] },
      ...range,
      inactive_since: day,
      include_inactive: { type: 'boolean' },
      limit: limit(50),
    }),
    requires: invoicing,
  },
  {
    name: 'upcoming_assemblies',
    description: 'Assemblies called and not yet held: date, place and agenda.',
    inputSchema: object({}),
    requires: { module: 'assemblies', level: 'read' },
  },
  {
    name: 'voting_result',
    description: 'Results of the latest closed votings. No argument needed.',
    inputSchema: object({ assembly_id: { type: 'string' } }),
    requires: { module: 'assemblies', level: 'read' },
  },
  {
    name: 'latest_announcements',
    description: 'The latest published announcements.',
    inputSchema: object({ n: limit(10) }),
    requires: { module: 'announcements', level: 'read' },
  },
  {
    name: 'my_contributions',
    description: "The user's own share capital and latest capital movements.",
    inputSchema: object({ n: limit(20) }),
    requires: { module: 'member-area', level: 'read' },
  },
  {
    name: 'partners_summary',
    description:
      "The cooperative's share capital and partners: total capital, active, suspended and invited partners and, in a period, contributions, refunds, joins and leaves (altas y bajas).",
    inputSchema: object({ ...range }),
    requires: othersInMemberArea,
  },
  {
    name: 'member_detail',
    description:
      'One partner by name or partner number: full name, NIF, status, share capital and movements.',
    inputSchema: object({ query: { type: 'string' }, n: limit(20) }, ['query']),
    requires: othersInMemberArea,
  },
  {
    name: 'partner_trade',
    description:
      'Partners that are also suppliers or customers (same NIF) and what we bought from and sold to each.',
    inputSchema: object({ ...range }),
    requires: othersInMemberArea,
    alsoRequires: [invoicing],
  },
];

/** BR-AI-01: the tools a user gets in a request, from what their profile can do. */
export function availableTools(
  can: (module: ToolModule, level: 'read', scope?: 'all') => boolean,
): readonly ToolSpec[] {
  return TOOL_CATALOG.filter((tool) =>
    [tool.requires, ...(tool.alsoRequires ?? [])].every(({ module, level, scope }) =>
      scope ? can(module, level, scope) : can(module, level),
    ),
  );
}
