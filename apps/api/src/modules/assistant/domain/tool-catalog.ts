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
  'list_delivery_notes',
  'invoice_totals',
  'invoice_detail',
  'open_discrepancies',
  'cash_forecast',
  'top_items',
  'third_party_summary',
  'payments_and_collections_summary',
  'find_third_party',
  'list_third_parties',
  'upcoming_assemblies',
  'voting_result',
  'latest_announcements',
  'my_contributions',
  'capital_summary',
  'member_census',
  'member_detail',
  'partner_trade',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const day = { type: 'string', description: 'Date as YYYY-MM-DD.' } as const;
const operation = {
  type: 'string',
  enum: ['purchase', 'sale'],
  description: 'purchase = supplier (received), sale = customer (issued).',
} as const;
const TRUNCATION =
  'It returns "total" (how many matched) and "truncated": when truncated is true say "muestro X de N" instead of presenting the list as complete.';
const thirdParty = {
  type: 'string',
  description: 'Part of the name or tax ID of the supplier or customer.',
} as const;

/**
 * Requirements/07, section 3. The order is the order the model sees them.
 */
export const TOOL_CATALOG: readonly ToolSpec[] = [
  {
    name: 'search_documents',
    description:
      "Searches the cooperative's documents (bylaws, regulations, minutes, accounts) by meaning and returns the most relevant fragments with their document and page. Use it for any question about what the documents say.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'What to look for, in Spanish. It must be standalone: the search does not see the conversation, so in a follow-up name the subject explicitly (for example "duración del mandato del consejo rector", not "y su mandato").',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    requires: { module: 'documents', level: 'read' },
  },
  {
    name: 'list_invoices',
    description: `Lists invoices (received from suppliers or issued to customers) with number, third party, issue and due dates, base, VAT rate, total, payment status and settlement date. ${TRUNCATION} For sums, counts or rankings use invoice_totals, not this list.`,
    inputSchema: {
      type: 'object',
      properties: {
        operation,
        status: {
          type: 'string',
          enum: ['pending', 'overdue', 'settled', 'voided'],
          description: 'Payment status. "pending" does not include overdue ones.',
        },
        third_party: thirdParty,
        from: { ...day, description: 'Only invoices issued from this date.' },
        to: { ...day, description: 'Only invoices issued up to this date.' },
        due_from: { ...day, description: 'Only invoices that fall due from this date.' },
        due_to: { ...day, description: 'Only invoices that fall due up to this date.' },
        settled_from: {
          ...day,
          description: 'Only invoices paid or collected from this date (settlement date).',
        },
        settled_to: {
          ...day,
          description: 'Only invoices paid or collected up to this date (settlement date).',
        },
      },
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'list_delivery_notes',
    description: `Lists purchase or sales delivery notes with their lines and whether they are already invoiced. Notes pending invoicing carry "ageDays" (days since their date). For "the oldest pending delivery notes" use status pending_invoicing with sort oldest_first. ${TRUNCATION}`,
    inputSchema: {
      type: 'object',
      properties: {
        operation,
        status: { type: 'string', enum: ['pending_invoicing', 'invoiced', 'voided'] },
        third_party: thirdParty,
        from: day,
        to: day,
        sort: {
          type: 'string',
          enum: ['newest_first', 'oldest_first'],
          description: 'By delivery note date (default newest_first).',
        },
      },
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'invoice_totals',
    description:
      'Adds up invoices in the database: count, base, VAT amount and total (exact; never add figures yourself). Use it for "how much did we buy/sell/invoice", "how many invoices", totals per month and rankings: group_by third_party ranks suppliers or customers by total, highest first ("top 5 suppliers this year": operation purchase, from and to the year, group_by third_party, limit 5); group_by month gives one row per month. Voided invoices are left out unless status is voided. For what was paid or collected in a period use settled_from and settled_to (months then follow the settlement date).',
    inputSchema: {
      type: 'object',
      properties: {
        operation,
        status: {
          type: 'string',
          enum: ['pending', 'overdue', 'settled', 'voided'],
          description: 'Payment status. "pending" does not include overdue ones.',
        },
        third_party: thirdParty,
        from: { ...day, description: 'Only invoices issued from this date.' },
        to: { ...day, description: 'Only invoices issued up to this date.' },
        settled_from: { ...day, description: 'Only invoices paid or collected from this date.' },
        settled_to: { ...day, description: 'Only invoices paid or collected up to this date.' },
        group_by: {
          type: 'string',
          enum: ['none', 'third_party', 'month'],
          description: 'none (default): one total. third_party: ranking. month: monthly series.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 25,
          description: 'How many groups with group_by third_party or month (default 10).',
        },
      },
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'invoice_detail',
    description:
      'One invoice by its number: header, base, VAT, total, payment and settlement, lines, linked delivery notes and the differences found against them. If several suppliers have the same number, it returns each one: narrow it with operation or third_party.',
    inputSchema: {
      type: 'object',
      properties: {
        number: {
          type: 'string',
          description: 'The invoice number, as written (for example F-77).',
        },
        operation,
        third_party: thirdParty,
      },
      required: ['number'],
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'open_discrepancies',
    description: `Invoices still to pay or collect whose quantities do not match their delivery notes, with the per-concept differences (delivered, invoiced, difference) and, when there is one, a drafted explanation. The numeric detail governs: give the numbers first and say the explanation is "orientativa". ${TRUNCATION}`,
    inputSchema: {
      type: 'object',
      properties: { operation },
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'cash_forecast',
    description:
      'Money still to pay to suppliers and to collect from customers, bucketed by due date (week, Monday to Sunday, or month) over an optional range. Each bucket has total, count and the overdue part; "total" already includes the overdue part, never add them. Use it for "how much do we have to pay in the next weeks/months" and cash flow questions.',
    inputSchema: {
      type: 'object',
      properties: {
        operation,
        due_from: { ...day, description: 'Only invoices that fall due from this date.' },
        due_to: { ...day, description: 'Only invoices that fall due up to this date.' },
        group_by: {
          type: 'string',
          enum: ['week', 'month'],
          description: 'Bucket size (default week).',
        },
      },
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'top_items',
    description:
      'What products or concepts move most: adds up the quantities of delivery note lines (or invoice lines) per concept and unit (spellings that differ in case, accents or spaces count as one), highest quantity first. Use it for "what do we buy/sell most", "how many kg of X did we receive". With concept and group_by month it gives the monthly evolution of that concept. Quantities in different units are never added together.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['delivery_notes', 'invoices'],
          description: 'Lines of delivery notes (default) or of invoices.',
        },
        operation,
        from: {
          ...day,
          description: 'From this date (the delivery note date or invoice issue date).',
        },
        to: { ...day, description: 'Up to this date.' },
        concept: { type: 'string', description: 'Only concepts containing this text.' },
        group_by: {
          type: 'string',
          enum: ['none', 'month'],
          description: 'none (default) or month (oldest month first).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 25,
          description: 'How many items (default 10).',
        },
      },
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'third_party_summary',
    description:
      'The whole picture of one supplier or customer, by name or tax ID: what is pending and overdue to pay or collect, its last delivery note and last invoice, and its invoices and delivery notes of the current year. Use it for "how are we with X", "when did we last buy from X". If several match it returns them so you can ask which one.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Part of the name or the NIF.' } },
      required: ['text'],
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'payments_and_collections_summary',
    description:
      'Totals still to pay to suppliers and to collect from customers, with the overdue part, open discrepancies and stale delivery notes. In each total, "pending" already includes the "overdue" part: never add them together.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'find_third_party',
    description:
      'Looks up a specific supplier or customer by part of its name or its tax ID (NIF). Use it only when the user gives a name or NIF; for "newest", "recent" or "list" questions use list_third_parties.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Part of the name or the NIF.' } },
      required: ['text'],
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'list_third_parties',
    description:
      'Lists suppliers and customers, newest registered first, with name, NIF, type, active flag, registration date and contact. Use it for "the newest/latest supplier", "suppliers registered this week", "list the customers", and, with inactive_since, for suppliers or customers we have not traded with since a date (they come with lastActivity, longest quiet first). For a specific name or NIF use find_third_party. ' +
      TRUNCATION,
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['supplier', 'customer', 'any'],
          description: 'supplier, customer or any (default).',
        },
        created_from: { ...day, description: 'Only those registered from this date.' },
        created_to: { ...day, description: 'Only those registered up to this date.' },
        inactive_since: {
          ...day,
          description:
            'Only active ones with no delivery note or invoice since this date (replaces the registration filters).',
        },
        include_inactive: {
          type: 'boolean',
          description: 'Also deactivated ones (default false).',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'How many (default 10).',
        },
      },
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'upcoming_assemblies',
    description:
      'Assemblies already called that have not happened yet, with date, place and agenda items (and which are voted).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    requires: { module: 'assemblies', level: 'read' },
  },
  {
    name: 'voting_result',
    description:
      'Results of the closed votings of an assembly. For "the last vote" or "the result of the voting" call it with no arguments: it then returns the latest assemblies. Pass an assembly id only if you already have one.',
    inputSchema: {
      type: 'object',
      properties: {
        assembly_id: {
          type: 'string',
          description: 'Optional. Leave it out unless you already have an id.',
        },
      },
      additionalProperties: false,
    },
    requires: { module: 'assemblies', level: 'read' },
  },
  {
    name: 'latest_announcements',
    description: 'The most recent published announcements of the cooperative.',
    inputSchema: {
      type: 'object',
      properties: {
        n: { type: 'integer', minimum: 1, maximum: 10, description: 'How many (default 5).' },
      },
      additionalProperties: false,
    },
    requires: { module: 'announcements', level: 'read' },
  },
  {
    name: 'my_contributions',
    description:
      "The user's own share capital (euros) and their latest capital movements. Only the user's own data, never another member's.",
    inputSchema: {
      type: 'object',
      properties: {
        n: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'How many latest movements (default 10).',
        },
      },
      additionalProperties: false,
    },
    requires: { module: 'member-area', level: 'read' },
  },
  {
    name: 'capital_summary',
    description:
      "The cooperative's total share capital (euros) and number of partners, plus the contributions and refunds registered in a period. Use it for 'how much capital does the cooperative have' and 'how much was contributed or refunded this year'. For one partner's capital use member_detail.",
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          ...day,
          description: 'Start of the period (inclusive). Leave out for all history.',
        },
        to: { ...day, description: 'End of the period (inclusive).' },
      },
      additionalProperties: false,
    },
    requires: { module: 'member-area', level: 'read', scope: 'all' },
  },
  {
    name: 'member_census',
    description:
      'Head counts of the partners: active ones now, suspended, invited and not yet activated, and (when a period is given) how many joined and how many left in it.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...day, description: 'Start of the period for joins and leaves (inclusive).' },
        to: { ...day, description: 'End of the period (inclusive).' },
      },
      additionalProperties: false,
    },
    requires: { module: 'member-area', level: 'read', scope: 'all' },
  },
  {
    name: 'member_detail',
    description:
      "One partner's record (partner number, NIF, status, profile, joining date), share capital and latest capital movements. Look the partner up by part of the name or by partner number. If several partners match, only their summary is returned: ask which one.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of the name or email, or the partner number.' },
        n: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'How many latest movements (default 10).',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    requires: { module: 'member-area', level: 'read', scope: 'all' },
  },
  {
    name: 'partner_trade',
    description:
      "Which partners are also suppliers or customers of the cooperative (matched by NIF) and how much the cooperative bought from and sold to each in a period (euros, voided invoices excluded). Use it for 'how much did we buy from our partners' and 'which partners are also suppliers'.",
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...day, description: 'Only invoices issued from this date.' },
        to: { ...day, description: 'Only invoices issued up to this date.' },
      },
      additionalProperties: false,
    },
    requires: { module: 'member-area', level: 'read', scope: 'all' },
    alsoRequires: [{ module: 'invoicing', level: 'read' }],
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
