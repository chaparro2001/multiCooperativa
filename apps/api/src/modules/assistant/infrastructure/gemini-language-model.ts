import {
  type Content,
  FinishReason,
  type FunctionCall,
  type GenerateContentResponse,
  type GoogleGenAI,
} from '@google/genai';

import type {
  LanguageModel,
  ModelMessage,
  ModelRequest,
  ModelTurn,
} from '../application/ports/language-model';

/** Flash class with a free tier and no card (ADR-009). Override with GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

/** A chat answer is short; the cap only protects against runaway output. */
const MAX_OUTPUT_TOKENS = 4096;

/** Finish reasons by which the provider's safety systems declined to answer. */
const REFUSALS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.IMAGE_SAFETY,
]);

function toContents(messages: ModelMessage[]): Content[] {
  return messages.map((message): Content => {
    switch (message.role) {
      case 'user':
        return { role: 'user', parts: [{ text: message.content }] };
      case 'assistant':
        // Inside a tool loop the model's own content goes back untouched (thought signatures included).
        return (
          (message.raw as Content | undefined) ?? {
            role: 'model',
            parts: [{ text: message.content }],
          }
        );
      case 'tool_results':
        return {
          role: 'user',
          parts: message.results.map((result) => ({
            functionResponse: {
              id: result.callId,
              name: result.name,
              response: result.isError ? { error: result.content } : { output: result.content },
            },
          })),
        };
    }
  });
}

function stopReasonOf(response: GenerateContentResponse, calls: FunctionCall[]): ModelTurn['stopReason'] {
  if (response.promptFeedback?.blockReason) return 'refusal';
  if (calls.length > 0) return 'tool_use';
  const finish = response.candidates?.[0]?.finishReason;
  if (finish && REFUSALS.has(finish)) return 'refusal';
  if (finish === FinishReason.MAX_TOKENS) return 'max_tokens';
  return 'end_turn';
}

/**
 * Gemini behind the language-model port (NFR-AI-02, ADR-009). Function calling over
 * `generateContent`, stateless: the history is sent on every call. The API key lives
 * only here (NFR-AI-03).
 */
export class GeminiLanguageModel implements LanguageModel {
  constructor(
    private readonly client: Pick<GoogleGenAI, 'models'>,
    private readonly model: string = DEFAULT_GEMINI_MODEL,
  ) {}

  async generate(request: ModelRequest): Promise<ModelTurn> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: toContents(request.messages),
      config: {
        systemInstruction: request.system,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        tools: request.tools.length
          ? [
              {
                functionDeclarations: request.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  parametersJsonSchema: tool.inputSchema,
                })),
              },
            ]
          : undefined,
      },
    });

    const content = response.candidates?.[0]?.content;
    const calls = response.functionCalls ?? [];
    // Thought parts are the model's reasoning, not the answer.
    const text = (content?.parts ?? [])
      .flatMap((part) => (part.text && !part.thought ? [part.text] : []))
      .join('');

    return {
      text,
      // Gemini does not always number its calls: the position stands in for the id.
      toolCalls: calls.map((call, index) => ({
        id: call.id ?? `call_${index + 1}`,
        name: call.name ?? '',
        input: call.args ?? {},
      })),
      stopReason: stopReasonOf(response, calls),
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens:
          (response.usageMetadata?.candidatesTokenCount ?? 0) +
          (response.usageMetadata?.thoughtsTokenCount ?? 0),
      },
      raw: content,
    };
  }
}
