import type {
  LanguageModel,
  ModelMessage,
  ModelRequest,
  ModelTurn,
  ToolCall,
} from '../ports/language-model';

const usage = { inputTokens: 10, outputTokens: 5 };

/** A turn that asks for tools. */
export const callTools = (...calls: { name: string; input?: unknown }[]): ModelTurn => ({
  text: '',
  stopReason: 'tool_use',
  usage,
  toolCalls: calls.map((call, index): ToolCall => ({
    id: `call_${index + 1}`,
    name: call.name,
    input: call.input ?? {},
  })),
});

/** A turn that answers. */
export const say = (text: string): ModelTurn => ({
  text,
  stopReason: 'end_turn',
  usage,
  toolCalls: [],
});

/**
 * Network-free model for tests (NFR-AI-02): replays the given turns in order, or
 * asks a function for each one. Keeps every request it received.
 */
export class ScriptedLanguageModel implements LanguageModel {
  readonly requests: ModelRequest[] = [];

  constructor(private readonly script: ModelTurn[] | ((request: ModelRequest) => ModelTurn)) {}

  async generate(request: ModelRequest): Promise<ModelTurn> {
    this.requests.push(structuredClone(request));
    if (typeof this.script === 'function') return this.script(request);
    const turn = this.script[this.requests.length - 1];
    if (!turn) throw new Error('The scripted model ran out of turns.');
    return turn;
  }
}

/** Text of the tool results the model has been given so far in this request. */
export function toolResultsIn(messages: ModelMessage[]): string[] {
  return messages.flatMap((message) =>
    message.role === 'tool_results' ? message.results.map((result) => result.content) : [],
  );
}
