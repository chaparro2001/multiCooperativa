import type {
  LanguageModel,
  ModelRequest,
  ModelTurn,
  ToolCall,
} from '../application/ports/language-model';

const usage = { inputTokens: 0, outputTokens: 0 };

const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Keyword rules from a Spanish question to the tools a sensible model would call. */
function plan(question: string): { name: string; input: unknown }[] {
  const q = plain(question);
  const calls: { name: string; input: unknown }[] = [];
  const add = (name: string, input: unknown = {}) => {
    if (!calls.some((call) => call.name === name)) calls.push({ name, input });
  };

  if (q.includes('busca el proveedor')) {
    add('find_third_party', { text: question.trim().split(/\s+/).at(-1) });
  } else if (q.includes('ultimo proveedor') || q.includes('proveedor nuevo')) {
    add('list_third_parties', { type: 'supplier', limit: 1 });
  } else if (q.includes('lista los clientes')) {
    add('list_third_parties', { type: 'customer' });
  } else if (q.includes('albaran')) {
    add('list_delivery_notes', { status: 'pending_invoicing' });
  } else if (q.includes('vencidas')) {
    add('list_invoices', { status: 'overdue' });
  } else if (q.includes('factura') && q.includes('venta')) {
    add('list_invoices', { operation: 'sale', status: 'pending' });
  } else if (q.includes('factura') && q.includes('vencen')) {
    add('list_invoices', { operation: 'purchase', due_from: '2026-10-19', due_to: '2026-10-25' });
  } else if (q.includes('factura')) {
    add('list_invoices');
  }
  if (q.includes('pagar') || q.includes('cobrar') || q.includes('debemos')) {
    add('payments_and_collections_summary');
  }
  if (q.includes('votacion')) add('voting_result');
  if (q.includes('asamblea') && q.includes('proxima')) add('upcoming_assemblies');
  if (q.includes('comunicado')) add('latest_announcements');
  if (/capital|aportacion|aportado/.test(q)) add('my_contributions');
  if (/estatutos|quorum|consejo|riego|helicoptero|documento/.test(q)) {
    add('search_documents', { query: question });
  }
  return calls;
}

interface ToolData {
  results?: Record<string, unknown>[];
  [key: string]: unknown;
}

const flatten = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? Object.values(value).map(flatten).join(' ')
    : String(value);

/**
 * Network-free stand-in for a competent model (NFR-AI-05): picks the tools by keyword,
 * only among the ones it was offered, and answers from their data with the `[S#]` markers.
 * It proves the pipeline (permissions, isolation, citations, limits); the same cases run
 * against the real model with `ai:eval` measure the model itself.
 */
export class RuleBasedLanguageModel implements LanguageModel {
  async generate(request: ModelRequest): Promise<ModelTurn> {
    const last = request.messages.at(-1);
    if (last?.role === 'tool_results') {
      return this.answer(last.results.map((result) => result.content));
    }
    const question = [...request.messages].reverse().find((m) => m.role === 'user');
    const offered = new Set(request.tools.map((tool) => tool.name));
    const calls = plan(question?.role === 'user' ? question.content : '').filter((call) =>
      offered.has(call.name),
    );
    if (calls.length === 0) return this.say('No tengo acceso a esa información.');
    return {
      text: '',
      stopReason: 'tool_use',
      usage,
      toolCalls: calls.map((call, index): ToolCall => ({ id: `call_${index + 1}`, ...call })),
    };
  }

  private answer(contents: string[]): ModelTurn {
    const lines: string[] = [];
    for (const content of contents) {
      const data = JSON.parse(content.replace(/^<tool_data>|<\/tool_data>$/g, '')) as ToolData;
      const { results = [], ...summary } = data;
      if (Object.keys(summary).length > 0 && !('note' in summary)) lines.push(flatten(summary));
      for (const item of results) {
        const { ref, ...fields } = item;
        lines.push(`${flatten(fields)}${ref ? ` [${String(ref)}]` : ''}`);
      }
    }
    if (lines.length === 0) return this.say('No lo encuentro en la documentación.');
    return this.say(lines.join('\n'));
  }

  private say(text: string): ModelTurn {
    return { text, stopReason: 'end_turn', usage, toolCalls: [] };
  }
}
