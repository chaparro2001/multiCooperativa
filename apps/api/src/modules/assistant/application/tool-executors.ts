import { z } from 'zod';

import type {
  AnnouncementReads,
  AssemblyReads,
  CooperativeContext,
  FragmentHit,
  InvoicingReads,
  MemberAreaReads,
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

/** Fragments given to the model per search. */
export const DOCUMENT_HITS = 5;
const EXCERPT = 300;

const day = z.iso.date().optional();
const operation = z.enum(['purchase', 'sale']).optional();

const inputs = {
  search_documents: z.object({ query: z.string().trim().min(3).max(300) }),
  list_invoices: z.object({
    operation,
    status: z.enum(['pending', 'overdue', 'settled', 'voided']).optional(),
    third_party: z.string().trim().max(100).optional(),
    from: day,
    to: day,
    due_from: day,
    due_to: day,
  }),
  list_delivery_notes: z.object({
    operation,
    status: z.enum(['pending_invoicing', 'invoiced', 'voided']).optional(),
    third_party: z.string().trim().max(100).optional(),
    from: day,
    to: day,
  }),
  payments_and_collections_summary: z.object({}),
  find_third_party: z.object({ text: z.string().trim().min(2).max(100) }),
  list_third_parties: z.object({
    type: z.enum(['supplier', 'customer', 'any']).optional(),
    created_from: day,
    created_to: day,
    include_inactive: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  upcoming_assemblies: z.object({}),
  voting_result: z.object({ assembly_id: z.uuid().optional() }),
  latest_announcements: z.object({ n: z.number().int().min(1).max(10).default(5) }),
  my_contributions: z.object({ n: z.number().int().min(1).max(20).default(10) }),
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
        items: hits.slice(0, DOCUMENT_HITS).map((hit) => ({
          data: { document: hit.title, category: hit.category, page: hit.page, text: hit.content },
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
      });
      return {
        items: rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record('invoice', row.id, `Invoice ${row.number} · ${row.thirdParty}`),
        })),
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
      });
      return {
        items: rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record(
            'delivery_note',
            row.id,
            `Delivery note ${row.number} · ${row.thirdParty}`,
          ),
        })),
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
        limit: input.limit,
      });
      return {
        items: rows.map((row) => ({
          data: { ...row, id: undefined },
          source: record('third_party', row.id, row.name),
        })),
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
  };
}

function record(kind: Source['kind'], resourceId: string, title: string): Source {
  return { kind, resourceId, title, page: null, versionId: null, excerpt: null };
}
