import type {
  LanguageModel,
  ModelRequest,
  ModelTurn,
  ToolCall,
} from '../application/ports/language-model';

const usage = { inputTokens: 0, outputTokens: 0 };

const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** The `period` a sensible model passes for a relative expression, instead of computing dates. */
const RELATIVE_PERIODS: [RegExp, string][] = [
  [/ultimos 30 dias/, 'last_30_days'],
  [/proximos 30 dias/, 'next_30_days'],
  [/trimestre pasado/, 'last_quarter'],
  [/este trimestre/, 'this_quarter'],
  [/ano pasado/, 'last_year'],
  [/este ano/, 'this_year'],
  [/mes pasado/, 'last_month'],
  [/este mes/, 'this_month'],
  [/semana pasada/, 'last_week'],
  [/semana que viene|proxima semana/, 'next_week'],
  [/mes que viene|proximo mes/, 'next_month'],
  [/esta semana/, 'this_week'],
];

/** Keyword rules from a Spanish question to the tools a sensible model would call. */
function plan(question: string): { name: string; input: unknown }[] {
  const q = plain(question);
  const when = RELATIVE_PERIODS.find(([pattern]) => pattern.test(q))?.[1];
  const calls: { name: string; input: unknown }[] = [];
  const add = (name: string, input: unknown = {}) => {
    if (!calls.some((call) => call.name === name)) calls.push({ name, input });
  };

  // Questions about other members (ADR-025): their tools replace the member's own capital.
  const aboutMembers =
    /socios|socio\b|censo|altas|bajas|capital social|capital de la cooperativa|capital total/.test(
      q,
    ) && !/tengo|mi |mis /.test(q);
  if (aboutMembers && /proveedor|compramos|vendimos|clientes/.test(q)) {
    add('partner_trade', { period: when ?? 'this_year' });
  } else if (aboutMembers && /capital social|capital de la cooperativa|capital total/.test(q)) {
    add('partners_summary', when ? { period: when } : {});
  } else if (aboutMembers && /cuantos socios|socios activos|altas|bajas|invitad/.test(q)) {
    add('partners_summary', { period: when ?? 'this_year' });
  } else if (aboutMembers && /capital|aportacion|numero de socio/.test(q)) {
    const named = question.match(/socio\s+(?:n[º°.]*\s*)?([^?¿]+?)\s*\??$/i)?.[1];
    add('member_detail', { query: (named ?? question).trim() });
  }

  const summaryOf = q.match(/como estamos con ([^?]+)/);
  if (summaryOf) {
    add('find_third_party', { text: question.match(/con ([^?]+)/i)?.[1]?.trim() });
  } else if (q.includes('mayores proveedores')) {
    add('invoice_totals', {
      operation: 'purchase',
      period: when ?? 'this_year',
      group_by: 'third_party',
      limit: 5,
    });
  } else if (q.includes('hemos facturado')) {
    add('invoice_totals', { operation: 'sale', period: when ?? 'this_year' });
  } else if (q.includes('detalle de la factura')) {
    add('invoice_detail', { number: question.match(/factura\s+([\w-]+)/i)?.[1] });
  } else if (q.includes('discrepancia')) {
    add('open_discrepancies');
  } else if (q.includes('prevision de caja')) {
    add('cash_forecast', { group_by: 'week', ...(when && { period: when }) });
  } else if (q.includes('evolucionado')) {
    add('top_items', { concept: 'aceite', group_by: 'month', operation: 'purchase' });
  } else if (q.includes('compramos mas')) {
    add('top_items', { operation: 'purchase', ...(when && { period: when }) });
  } else if (q.includes('sin actividad')) {
    add('list_third_parties', { type: 'supplier', inactive_since: '2026-09-01' });
  } else if (q.includes('albaran') && q.includes('antiguos')) {
    add('list_delivery_notes', { status: 'pending_invoicing', sort: 'oldest_first' });
  } else if (q.includes('se pagaron') || q.includes('se han pagado')) {
    add(
      'list_invoices',
      when
        ? { status: 'settled', period: when, date: 'settled' }
        : { status: 'settled', from: '2026-09-01', to: '2026-09-30', date: 'settled' },
    );
  } else if (q.includes('busca el proveedor')) {
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
    add('list_invoices', { operation: 'purchase', period: when ?? 'this_week', date: 'due' });
  } else if (q.includes('factura')) {
    add('list_invoices');
  }
  if (q.includes('pagar') || q.includes('cobrar') || q.includes('debemos')) {
    add('payments_and_collections_summary');
  }
  if (q.includes('votacion')) add('voting_result');
  if (q.includes('asamblea') && q.includes('proxima')) add('upcoming_assemblies');
  if (q.includes('comunicado')) add('latest_announcements');
  if (!aboutMembers && /capital|aportacion|aportado/.test(q)) add('my_contributions');
  if (/estatutos|quorum|consejo|riego|helicoptero|documento/.test(q)) {
    add('search_documents', { query: question });
  }
  return calls;
}

interface ToolData {
  results?: Record<string, unknown>[];
  sources?: { ref: string; source: string }[];
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
    const userMessages = request.messages.flatMap((m) => (m.role === 'user' ? [m.content] : []));
    const question = userMessages.at(-1) ?? '';
    const offered = new Set(request.tools.map((tool) => tool.name));
    let planned = plan(question);
    // A follow-up with no subject of its own: like a good model, search for the earlier
    // question plus the follow-up, so the query stands alone.
    if (planned.length === 0 && userMessages.length > 1) {
      const subject = userMessages
        .slice(0, -1)
        .reverse()
        .find((earlier) => plan(earlier).length > 0);
      if (subject) {
        planned = plan(subject).map((call) =>
          call.name === 'search_documents'
            ? { ...call, input: { query: `${subject} ${question}` } }
            : call,
        );
      }
    }
    const calls = planned.filter((call) => offered.has(call.name));
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
      const { results = [], sources = [], ...summary } = data;
      if (Object.keys(summary).length > 0 && !('note' in summary)) lines.push(flatten(summary));
      // The records behind a computed figure, each with its marker.
      for (const { ref, source } of sources) lines.push(`${source} [${ref}]`);
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
