import { hasAccess, ModuleAccessDeniedError, requireAccess } from '../../access';
import { extractCitations, type Source } from '../domain/citations';
import { buildSystemPrompt } from '../domain/system-prompt';
import { availableTools, type ToolName, type ToolSpec } from '../domain/tool-catalog';
import {
  conversationTitle,
  retryAfterSeconds,
  usageExceeded,
  usageWindowStart,
} from '../domain/usage';
import type { CooperativeContext } from './data-sources';
import {
  AssistantRefusedError,
  AssistantUnavailableError,
  ConversationNotFoundError,
  UsageLimitExceededError,
} from './errors';
import type {
  ConversationRecord,
  ConversationStore,
  MessageRecord,
  Rating,
} from './ports/conversation-store';
import type { LanguageModel, ModelMessage, ToolCall, ToolResult } from './ports/language-model';
import { InvalidToolInputError, type ToolExecutor, type ToolOutput } from './tool-executors';

/** NFR-AI-04: what is measured per request. Never the content of the conversation. */
export interface RequestMetrics {
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
  tools: string[];
}

export interface AssistantDeps {
  conversations: ConversationStore;
  /** Null when no provider is configured (ADR-009): the assistant answers 503, the rest works. */
  model: LanguageModel | null;
  executors: Record<ToolName, ToolExecutor>;
  now: () => Date;
  /** Day in the cooperative's calendar (YYYY-MM-DD), for the system prompt. */
  today: () => string;
  messageLimitPerHour: number;
  onMetrics?: (metrics: RequestMetrics) => void;
}

/** A question that needs the model to call tools several times is still bounded. */
export const MAX_MODEL_CALLS = 6;
/** Previous messages sent as context (US-AI-04). */
export const HISTORY_MESSAGES = 20;

/** BR-AI-01: the tools are computed from the user's permissions on every request. */
function toolsFor(context: CooperativeContext): readonly ToolSpec[] {
  return availableTools((module, level) => hasAccess(context.permissions, module, level));
}

// ── Conversations (US-AI-04, BR-AI-07) ──

export async function createConversation(
  deps: AssistantDeps,
  context: CooperativeContext,
): Promise<ConversationRecord> {
  requireAccess(context.permissions, 'assistant', 'read');
  return deps.conversations.create(context.cooperativeId, context.membershipId);
}

export async function listConversations(
  deps: AssistantDeps,
  context: CooperativeContext,
): Promise<ConversationRecord[]> {
  requireAccess(context.permissions, 'assistant', 'read');
  return deps.conversations.list(context.cooperativeId, context.membershipId);
}

export async function getConversation(
  deps: AssistantDeps,
  context: CooperativeContext,
  conversationId: string,
): Promise<{ conversation: ConversationRecord; messages: MessageRecord[] }> {
  requireAccess(context.permissions, 'assistant', 'read');
  const conversation = await deps.conversations.find(
    context.cooperativeId,
    context.membershipId,
    conversationId,
  );
  if (!conversation) throw new ConversationNotFoundError();
  const messages = await deps.conversations.messages(
    context.cooperativeId,
    context.membershipId,
    conversationId,
  );
  return { conversation, messages };
}

/** US-AI-05. */
export async function rateMessage(
  deps: AssistantDeps,
  context: CooperativeContext,
  messageId: string,
  rating: Rating,
): Promise<MessageRecord> {
  requireAccess(context.permissions, 'assistant', 'read');
  const message = await deps.conversations.rate(
    context.cooperativeId,
    context.membershipId,
    messageId,
    rating,
  );
  if (!message) throw new ConversationNotFoundError();
  return message;
}

// ── Sending a message ──

/** Wraps what a tool found: the model reads it as data, not as instructions (BR-AI-06). */
function serialize(output: ToolOutput, sources: Map<string, Source>): string {
  const results = output.items.map((item) => {
    if (!item.source) return item.data;
    const ref = `S${sources.size + 1}`;
    sources.set(ref, item.source);
    return { ref, ...item.data };
  });
  const body =
    results.length === 0 && !output.summary
      ? { results: [], note: 'No results.' }
      : { ...output.summary, results };
  return `<tool_data>${JSON.stringify(body)}</tool_data>`;
}

const fail = (call: ToolCall, content: string): ToolResult => ({
  callId: call.id,
  name: call.name,
  content: `<tool_data>${JSON.stringify({ error: content })}</tool_data>`,
  isError: true,
});

/**
 * BR-AI-01 and BR-AI-03: a call is only run if the tool was offered to this user, and
 * even then the use case behind it checks the permission again (BR-AI-02).
 */
async function runTool(
  deps: AssistantDeps,
  context: CooperativeContext,
  offered: ReadonlySet<string>,
  call: ToolCall,
  sources: Map<string, Source>,
): Promise<ToolResult> {
  if (!offered.has(call.name)) {
    return fail(
      call,
      'This tool is not available to the user. Tell them you cannot access that information.',
    );
  }
  try {
    const executor = deps.executors[call.name as ToolName];
    return {
      callId: call.id,
      name: call.name,
      content: serialize(await executor(context, call.input), sources),
      isError: false,
    };
  } catch (error) {
    if (error instanceof ModuleAccessDeniedError) {
      return fail(
        call,
        'The user has no access to this information. Tell them you cannot access it.',
      );
    }
    if (error instanceof InvalidToolInputError) return fail(call, error.message);
    // The model never sees internals; the operator does.
    console.error(
      `Assistant tool ${call.name} failed:`,
      error instanceof Error ? error.message : error,
    );
    return fail(call, 'The information is temporarily unavailable.');
  }
}

/**
 * US-AI-01..04: the question goes to the model with the tools the user's profile
 * allows; whatever the model asks for runs as that user, in that cooperative.
 */
export async function sendMessage(
  deps: AssistantDeps,
  context: CooperativeContext,
  conversationId: string,
  content: string,
): Promise<{ user: MessageRecord; answer: MessageRecord }> {
  requireAccess(context.permissions, 'assistant', 'read');
  const { cooperativeId, membershipId } = context;

  const conversation = await deps.conversations.find(cooperativeId, membershipId, conversationId);
  if (!conversation) throw new ConversationNotFoundError();
  if (!deps.model) throw new AssistantUnavailableError();

  // BR-AI-08
  const now = deps.now();
  const since = usageWindowStart(now);
  const usage = await deps.conversations.usageSince(cooperativeId, membershipId, since);
  if (usageExceeded(usage.count, deps.messageLimitPerHour)) {
    throw new UsageLimitExceededError(
      deps.messageLimitPerHour,
      retryAfterSeconds(usage.oldest, now),
    );
  }

  const history = await deps.conversations.messages(
    cooperativeId,
    membershipId,
    conversationId,
    HISTORY_MESSAGES,
  );
  const tools = toolsFor(context);
  const offered = new Set<string>(tools.map((tool) => tool.name));
  const system = buildSystemPrompt({ today: deps.today(), toolNames: [...offered] });
  const messages: ModelMessage[] = [
    ...history.map((message): ModelMessage => ({ role: message.role, content: message.content })),
    { role: 'user', content },
  ];

  const sources = new Map<string, Source>();
  const used_tools: string[] = [];
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let modelCalls = 0;
  let answerText: string | null = null;

  while (modelCalls < MAX_MODEL_CALLS && answerText === null) {
    let turn;
    try {
      modelCalls++;
      turn = await deps.model.generate({
        system,
        messages,
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema: { ...inputSchema },
        })),
      });
    } catch (error) {
      console.error('Assistant model call failed:', error instanceof Error ? error.message : error);
      throw error instanceof AssistantRefusedError || error instanceof AssistantUnavailableError
        ? error
        : new AssistantUnavailableError();
    }
    inputTokens += turn.usage.inputTokens;
    outputTokens += turn.usage.outputTokens;

    if (turn.stopReason === 'refusal') throw new AssistantRefusedError();
    if (turn.stopReason !== 'tool_use' || turn.toolCalls.length === 0) {
      answerText = turn.text;
      break;
    }

    messages.push({ role: 'assistant', content: turn.text, raw: turn.raw });
    const results = await Promise.all(
      turn.toolCalls.map((call) => runTool(deps, context, offered, call, sources)),
    );
    for (const call of turn.toolCalls) {
      if (!used_tools.includes(call.name)) used_tools.push(call.name);
    }
    messages.push({ role: 'tool_results', results });
  }
  // Out of calls without an answer: better to say so than to leave the user waiting.
  if (answerText === null || answerText.trim() === '') throw new AssistantUnavailableError();

  deps.onMetrics?.({
    durationMs: Date.now() - started,
    inputTokens,
    outputTokens,
    modelCalls,
    tools: used_tools,
  });

  const { text, citations } = extractCitations(answerText, sources);
  const stored = await deps.conversations.appendExchange(
    cooperativeId,
    membershipId,
    conversationId,
    {
      user: { role: 'user', content, citations: [], tools: [] },
      answer: { role: 'assistant', content: text, citations, tools: used_tools },
      title: conversationTitle(content),
    },
  );
  if (!stored) throw new ConversationNotFoundError();
  return stored;
}
