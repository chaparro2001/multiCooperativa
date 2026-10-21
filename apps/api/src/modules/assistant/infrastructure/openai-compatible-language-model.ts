import {
  HOSTED_RAW_MARK,
  HostedProviderError,
  HostedProviderKeyInvalidError,
  HostedProviderTransientError,
  isHostedRaw,
} from '../application/ports/hosted-provider';
import type {
  LanguageModel,
  ModelMessage,
  ModelRequest,
  ModelTurn,
  ToolCall,
} from '../application/ports/language-model';

/** A hosted provider answers in seconds; the call gets time but never hangs forever. */
export const DEFAULT_HOSTED_TIMEOUT_MS = 60_000;

/** A chat answer is short; the cap only protects against runaway output. */
const MAX_OUTPUT_TOKENS = 1024;

interface OpenAIToolCall {
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIChatResponse {
  choices?: { message?: OpenAIMessage; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface OpenAICompatibleSettings {
  /** Root of the provider's OpenAI-compatible API, from the fixed catalog. */
  baseUrl: string;
  model: string;
  /** The cooperative's own key. Sent only as the bearer token; never logged or put in an error. */
  apiKey: string;
  timeoutMs?: number;
}

/** An assistant turn of this adapter keeps the provider's message to send it back untouched. */
interface HostedRaw {
  provider: typeof HOSTED_RAW_MARK;
  message: OpenAIMessage;
}

function toMessages(system: string, messages: ModelMessage[]): OpenAIMessage[] {
  const converted: OpenAIMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    switch (message.role) {
      case 'user':
        converted.push({ role: 'user', content: message.content });
        break;
      case 'assistant':
        converted.push(
          isHostedRaw(message.raw)
            ? (message.raw as HostedRaw).message
            : { role: 'assistant', content: message.content },
        );
        break;
      case 'tool_results':
        for (const result of message.results) {
          converted.push({
            role: 'tool',
            tool_call_id: result.callId,
            content: result.isError ? `error: ${result.content}` : result.content,
          });
        }
        break;
    }
  }
  return converted;
}

/** Reasoning models may leave their `<think>` block in the content: it is not the answer. */
const stripThinking = (text: string) => text.replace(/^[\s\S]*<\/think>/, '').trim();

function parseCalls(raw: OpenAIToolCall[], allowed: ReadonlySet<string>): ToolCall[] {
  return raw.map((call, index) => {
    const name = call.function?.name;
    if (typeof name !== 'string' || !allowed.has(name)) {
      throw new HostedProviderError(`The model called an unknown tool: ${String(name)}.`);
    }
    let input: unknown = call.function?.arguments ?? {};
    if (typeof input === 'string') {
      try {
        input = input.trim() === '' ? {} : (JSON.parse(input) as unknown);
      } catch (error) {
        throw new HostedProviderError(
          `The model sent malformed arguments for ${name}.`,
          undefined,
          error,
        );
      }
    }
    const id = typeof call.id === 'string' && call.id !== '' ? call.id : `call_${index + 1}`;
    return { id, name, input };
  });
}

/** 401 and 403 mean the key; 429, 408, 404 (model gone), 5xx mean "not now"; the rest is a failed request. */
export function errorForStatus(status: number, what: string): HostedProviderError {
  if (status === 401 || status === 403) {
    return new HostedProviderKeyInvalidError(
      `The provider rejected the API key (${status}).`,
      status,
    );
  }
  if (status === 429 || status === 408 || status === 404 || status >= 500) {
    return new HostedProviderTransientError(`${what} responded ${status}.`, status);
  }
  return new HostedProviderError(`${what} responded ${status}.`, status);
}

/**
 * A hosted OpenAI-compatible provider behind the language-model port (NFR-AI-02, ADR-019).
 * `POST {baseUrl}/chat/completions` with function tools, not streamed. The history goes on every
 * call. The API key travels only in the Authorization header and never appears in an error.
 */
export class OpenAICompatibleLanguageModel implements LanguageModel {
  constructor(
    private readonly settings: OpenAICompatibleSettings,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async generate(request: ModelRequest): Promise<ModelTurn> {
    const tools = request.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
    }));
    const body = {
      model: this.settings.model,
      messages: toMessages(request.system, request.messages),
      temperature: 0.2,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(tools.length > 0 ? { tools } : {}),
    };

    let response: Response;
    try {
      response = await this.doFetch(
        `${this.settings.baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.settings.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.settings.timeoutMs ?? DEFAULT_HOSTED_TIMEOUT_MS),
        },
      );
    } catch (error) {
      // The cause is kept out on purpose: a failed fetch may echo request details.
      throw new HostedProviderTransientError(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'The provider did not answer in time.'
          : 'Cannot reach the provider.',
      );
    }
    if (!response.ok) throw errorForStatus(response.status, 'The provider');

    let payload: OpenAIChatResponse;
    try {
      payload = (await response.json()) as OpenAIChatResponse;
    } catch {
      throw new HostedProviderError('Unreadable response from the provider.');
    }
    return this.toTurn(payload, new Set(request.tools.map((tool) => tool.name)));
  }

  private toTurn(payload: OpenAIChatResponse, allowed: ReadonlySet<string>): ModelTurn {
    const choice = payload.choices?.[0];
    const message = choice?.message;
    if (!message) throw new HostedProviderError('Unexpected response from the provider.');

    const text = stripThinking(typeof message.content === 'string' ? message.content : '');
    const toolCalls = parseCalls(message.tool_calls ?? [], allowed);
    const finish = choice.finish_reason;

    return {
      text,
      toolCalls,
      stopReason:
        toolCalls.length > 0
          ? 'tool_use'
          : finish === 'length'
            ? 'max_tokens'
            : finish === 'content_filter'
              ? 'refusal'
              : 'end_turn',
      usage: {
        inputTokens: payload.usage?.prompt_tokens ?? 0,
        outputTokens: payload.usage?.completion_tokens ?? 0,
      },
      raw: {
        provider: HOSTED_RAW_MARK,
        message: {
          role: 'assistant',
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        },
      } satisfies HostedRaw,
    };
  }
}
