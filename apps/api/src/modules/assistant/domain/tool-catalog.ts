/** Modules whose data the assistant can read. */
export type ToolModule = 'documents' | 'invoicing' | 'assemblies' | 'announcements' | 'member-area';

export interface ToolSpec {
  readonly name: ToolName;
  /** What the model reads to decide when to call it. */
  readonly description: string;
  /** JSON Schema of the input. */
  readonly inputSchema: Readonly<Record<string, unknown>>;
  /** BR-AI-01: the tool exists for a user only if their profile has this. BR-AI-03: always read. */
  readonly requires: { readonly module: ToolModule; readonly level: 'read' };
}

export const TOOL_NAMES = [
  'search_documents',
  'list_invoices',
  'list_delivery_notes',
  'payments_and_collections_summary',
  'find_third_party',
  'list_third_parties',
  'upcoming_assemblies',
  'voting_result',
  'latest_announcements',
  'my_contributions',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const day = { type: 'string', description: 'Date as YYYY-MM-DD.' } as const;
const operation = {
  type: 'string',
  enum: ['purchase', 'sale'],
  description: 'purchase = supplier (received), sale = customer (issued).',
} as const;
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
      properties: { query: { type: 'string', description: 'What to look for, in Spanish.' } },
      required: ['query'],
      additionalProperties: false,
    },
    requires: { module: 'documents', level: 'read' },
  },
  {
    name: 'list_invoices',
    description:
      'Lists invoices (received from suppliers or issued to customers) with their due date and payment status.',
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
      },
      additionalProperties: false,
    },
    requires: { module: 'invoicing', level: 'read' },
  },
  {
    name: 'list_delivery_notes',
    description: 'Lists purchase or sales delivery notes and whether they are already invoiced.',
    inputSchema: {
      type: 'object',
      properties: {
        operation,
        status: { type: 'string', enum: ['pending_invoicing', 'invoiced', 'voided'] },
        third_party: thirdParty,
        from: day,
        to: day,
      },
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
      'Lists suppliers and customers, newest registered first, with name, NIF, type, active flag, registration date and contact. Use it for "the newest/latest supplier", "suppliers registered this week", "list the customers". For a specific name or NIF use find_third_party.',
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
];

/** BR-AI-01: the tools a user gets in a request, from what their profile can do. */
export function availableTools(
  can: (module: ToolModule, level: 'read') => boolean,
): readonly ToolSpec[] {
  return TOOL_CATALOG.filter((tool) => can(tool.requires.module, tool.requires.level));
}
