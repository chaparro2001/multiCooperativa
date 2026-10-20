/**
 * The model provider behind a port so it can be replaced (NFR-AI-02). Nothing
 * here knows the provider's SDK.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Whatever the model sent: untrusted until the tool validates it. */
  input: unknown;
}

export interface ToolResult {
  callId: string;
  content: string;
  isError: boolean;
}

export type ModelMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      /** The provider's own representation of this turn, sent back untouched in the tool loop. */
      raw?: unknown;
    }
  | { role: 'tool_results'; results: ToolResult[] };

export interface ModelTurn {
  text: string;
  toolCalls: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal';
  usage: { inputTokens: number; outputTokens: number };
  raw?: unknown;
}

export interface ModelRequest {
  system: string;
  messages: ModelMessage[];
  tools: ToolDefinition[];
}

export interface LanguageModel {
  generate(request: ModelRequest): Promise<ModelTurn>;
}
