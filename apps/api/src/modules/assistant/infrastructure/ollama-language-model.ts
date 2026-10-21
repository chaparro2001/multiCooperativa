import type {
  LanguageModel,
  ModelMessage,
  ModelRequest,
  ModelTurn,
  ToolCall,
} from '../application/ports/language-model';

/** Tool-capable model that runs on CPU, measured in ADR-013. Override with ASSISTANT_OLLAMA_MODEL. */
export const DEFAULT_OLLAMA_CHAT_MODEL = 'qwen3:8b';

/** A CPU-only host reads a long prompt slowly: the call gets time, but never hangs forever. */
export const DEFAULT_OLLAMA_TIMEOUT_MS = 90_000;

/** Prompt + tool descriptions + tool results; Ollama's own default (4096) is tight for the loop. */
export const DEFAULT_OLLAMA_CONTEXT_TOKENS = 8192;

/** A chat answer is short; the cap only protects against runaway output. */
const MAX_OUTPUT_TOKENS = 1024;

/** The model did not follow the tool protocol or the service failed: the assistant answers 503. */
export class OllamaLanguageModelError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'OllamaLanguageModelError';
  }
}

interface OllamaToolCall {
  function?: { name?: unknown; arguments?: unknown };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaChatResponse {
  message?: { content?: unknown; tool_calls?: OllamaToolCall[] };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaLanguageModelSettings {
  url: string;
  model: string;
  timeoutMs?: number;
  contextTokens?: number;
}

function toMessages(system: string, messages: ModelMessage[]): OllamaMessage[] {
  const converted: OllamaMessage[] = [{ role: 'system', content: system }];
  for (const message of messages) {
    switch (message.role) {
      case 'user':
        converted.push({ role: 'user', content: message.content });
        break;
      case 'assistant':
        // Inside a tool loop the model's own message goes back untouched.
        converted.push(
          (message.raw as OllamaMessage | undefined) ?? {
            role: 'assistant',
            content: message.content,
          },
        );
        break;
      case 'tool_results':
        for (const result of message.results) {
          converted.push({
            role: 'tool',
            tool_name: result.name,
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

/** A model that "calls" a tool by writing JSON in its text instead of using the tool-call field. */
const LOOKS_LIKE_TEXT_TOOL_CALL = /^\s*(```(?:json)?\s*)?[[{][\s\S]*"(?:name|tool|function)"\s*:/;

function parseCalls(raw: OllamaToolCall[], allowed: ReadonlySet<string>): ToolCall[] {
  return raw.map((call, index) => {
    const name = call.function?.name;
    if (typeof name !== 'string' || !allowed.has(name)) {
      throw new OllamaLanguageModelError(`The model called an unknown tool: ${String(name)}.`);
    }
    let input: unknown = call.function?.arguments ?? {};
    if (typeof input === 'string') {
      try {
        input = JSON.parse(input) as unknown;
      } catch (error) {
        throw new OllamaLanguageModelError(
          `The model sent malformed arguments for ${name}.`,
          undefined,
          error,
        );
      }
    }
    // Ollama does not number its calls: the position stands in for the id.
    return { id: `call_${index + 1}`, name, input };
  });
}

/**
 * A local model served by Ollama behind the language-model port (NFR-AI-02, ADR-013).
 * `POST /api/chat` with function tools, not streamed, with thinking off: stateless, the
 * history goes on every call. Nothing leaves the host. A small model may break the tool
 * protocol; that is detected and reported as an error, which the use case turns into
 * "assistant unavailable".
 */
export class OllamaLanguageModel implements LanguageModel {
  constructor(
    private readonly settings: OllamaLanguageModelSettings,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async generate(request: ModelRequest): Promise<ModelTurn> {
    const body = {
      model: this.settings.model,
      stream: false,
      think: false,
      messages: toMessages(request.system, request.messages),
      tools: request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      })),
      options: {
        temperature: 0.2,
        num_ctx: this.settings.contextTokens ?? DEFAULT_OLLAMA_CONTEXT_TOKENS,
        num_predict: MAX_OUTPUT_TOKENS,
      },
    };
    if (body.tools.length === 0) delete (body as { tools?: unknown }).tools;

    let response: Response;
    try {
      response = await this.doFetch(`${this.settings.url.replace(/\/+$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.settings.timeoutMs ?? DEFAULT_OLLAMA_TIMEOUT_MS),
      });
    } catch (error) {
      throw new OllamaLanguageModelError('Cannot reach the Ollama service.', undefined, error);
    }
    if (!response.ok) {
      throw new OllamaLanguageModelError(
        `The Ollama service responded ${response.status}. Is the model ${this.settings.model} downloaded?`,
        response.status,
      );
    }

    let payload: OllamaChatResponse;
    try {
      payload = (await response.json()) as OllamaChatResponse;
    } catch (error) {
      throw new OllamaLanguageModelError('Unreadable response from Ollama.', undefined, error);
    }
    return this.toTurn(payload, new Set(request.tools.map((tool) => tool.name)));
  }

  private toTurn(payload: OllamaChatResponse, allowed: ReadonlySet<string>): ModelTurn {
    const message = payload.message;
    if (!message) throw new OllamaLanguageModelError('Unexpected response from Ollama.');

    const text = stripThinking(typeof message.content === 'string' ? message.content : '');
    const toolCalls = parseCalls(message.tool_calls ?? [], allowed);
    if (toolCalls.length === 0 && LOOKS_LIKE_TEXT_TOOL_CALL.test(text)) {
      throw new OllamaLanguageModelError('The model wrote a tool call as text.');
    }

    return {
      text,
      toolCalls,
      stopReason:
        toolCalls.length > 0
          ? 'tool_use'
          : payload.done_reason === 'length'
            ? 'max_tokens'
            : 'end_turn',
      usage: { inputTokens: payload.prompt_eval_count ?? 0, outputTokens: payload.eval_count ?? 0 },
      raw: { role: 'assistant', content: text, tool_calls: message.tool_calls },
    };
  }
}
