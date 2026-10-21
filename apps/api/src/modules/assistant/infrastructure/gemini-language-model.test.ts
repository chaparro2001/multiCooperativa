import type { GoogleGenAI } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_GEMINI_MODEL, GeminiLanguageModel } from './gemini-language-model';

/** Same getter the SDK's response class offers over the parts of the first candidate. */
function responseOf(parts: object[], extra: object = {}) {
  const functionCalls = parts.flatMap((part) =>
    'functionCall' in part ? [(part as { functionCall: object }).functionCall] : [],
  );
  return {
    candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
    functionCalls: functionCalls.length ? functionCalls : undefined,
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
    ...extra,
  };
}

function clientReturning(response: object) {
  const generateContent = vi.fn(async () => response);
  return {
    generateContent,
    client: { models: { generateContent } } as unknown as Pick<GoogleGenAI, 'models'>,
  };
}

const request = {
  system: 'system prompt',
  messages: [{ role: 'user' as const, content: 'hello' }],
  tools: [
    {
      name: 'search_documents',
      description: 'Searches',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
};

describe('GeminiLanguageModel (NFR-AI-02, NFR-AI-03, ADR-009)', () => {
  it('defaults to a Flash-class model', () => {
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.8-flash');
  });

  it('sends the system instruction, the history and the tools as function declarations', async () => {
    const { generateContent, client } = clientReturning(responseOf([{ text: 'Hola' }]));

    const turn = await new GeminiLanguageModel(client).generate(request);

    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      config: {
        systemInstruction: 'system prompt',
        maxOutputTokens: 4096,
        tools: [
          {
            functionDeclarations: [
              {
                name: 'search_documents',
                description: 'Searches',
                parametersJsonSchema: { type: 'object', properties: {} },
              },
            ],
          },
        ],
      },
    });
    expect(turn).toMatchObject({
      text: 'Hola',
      stopReason: 'end_turn',
      toolCalls: [],
      usage: { inputTokens: 12, outputTokens: 7 },
    });
  });

  it('ignores thought parts when building the answer', async () => {
    const { client } = clientReturning(
      responseOf([{ text: 'reasoning', thought: true }, { text: 'Respuesta' }]),
    );

    expect((await new GeminiLanguageModel(client).generate(request)).text).toBe('Respuesta');
  });

  it('turns function calls into tool calls and sends the results back paired by name', async () => {
    const parts = [
      {
        functionCall: { name: 'search_documents', args: { query: 'quorum' } },
        thoughtSignature: 'sig',
      },
    ];
    const { generateContent, client } = clientReturning(responseOf(parts));
    const model = new GeminiLanguageModel(client);

    const turn = await model.generate(request);

    expect(turn.stopReason).toBe('tool_use');
    expect(turn.toolCalls).toEqual([
      { id: 'call_1', name: 'search_documents', input: { query: 'quorum' } },
    ]);

    await model.generate({
      ...request,
      messages: [
        ...request.messages,
        { role: 'assistant', content: '', raw: turn.raw },
        {
          role: 'tool_results',
          results: [
            { callId: 'call_1', name: 'search_documents', content: 'data', isError: false },
            { callId: 'call_2', name: 'list_invoices', content: 'denied', isError: true },
          ],
        },
      ],
    });
    const sent = (generateContent.mock.calls[1] as unknown as [{ contents: unknown[] }])[0]
      .contents;
    // The model's own content, thought signature included, goes back untouched.
    expect(sent[1]).toEqual({ role: 'model', parts });
    expect(sent[2]).toEqual({
      role: 'user',
      parts: [
        {
          functionResponse: {
            id: 'call_1',
            name: 'search_documents',
            response: { output: 'data' },
          },
        },
        {
          functionResponse: { id: 'call_2', name: 'list_invoices', response: { error: 'denied' } },
        },
      ],
    });
  });

  it('reports a safety block as a refusal', async () => {
    const blockedPrompt = clientReturning({
      candidates: undefined,
      promptFeedback: { blockReason: 'SAFETY' },
    });
    const blockedAnswer = clientReturning({
      candidates: [{ content: undefined, finishReason: 'SAFETY' }],
    });

    expect((await new GeminiLanguageModel(blockedPrompt.client).generate(request)).stopReason).toBe(
      'refusal',
    );
    expect((await new GeminiLanguageModel(blockedAnswer.client).generate(request)).stopReason).toBe(
      'refusal',
    );
  });

  it('reports a cut-off answer', async () => {
    const { client } = clientReturning({
      candidates: [{ content: { parts: [{ text: 'Parcial' }] }, finishReason: 'MAX_TOKENS' }],
    });

    expect((await new GeminiLanguageModel(client).generate(request)).stopReason).toBe('max_tokens');
  });

  describe('overload resilience (ADR-009)', () => {
    const fast = { sleep: async () => undefined, onRetry: () => undefined };
    const overloaded = Object.assign(new Error('{"status":"UNAVAILABLE"}'), { status: 503 });

    it('retries a 503 and returns the answer', async () => {
      const generateContent = vi
        .fn()
        .mockRejectedValueOnce(overloaded)
        .mockResolvedValue(responseOf([{ text: 'Hola' }]));
      const client = { models: { generateContent } } as unknown as Pick<GoogleGenAI, 'models'>;

      const turn = await new GeminiLanguageModel(client, 'primary', [], fast).generate(request);

      expect(turn.text).toBe('Hola');
      expect(generateContent).toHaveBeenCalledTimes(2);
    });

    it('falls back to the next model when the primary stays overloaded', async () => {
      const generateContent = vi.fn(async ({ model }: { model: string }) => {
        if (model === 'primary') throw overloaded;
        return responseOf([{ text: `from ${model}` }]);
      });
      const client = { models: { generateContent } } as unknown as Pick<GoogleGenAI, 'models'>;

      const turn = await new GeminiLanguageModel(client, 'primary', ['backup'], fast).generate(
        request,
      );

      expect(turn.text).toBe('from backup');
      expect(generateContent.mock.calls.map(([params]) => params.model)).toEqual([
        'primary',
        'primary',
        'primary',
        'backup',
      ]);
    });

    it('does not retry a rejected key', async () => {
      const generateContent = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('x'), { status: 403 }));
      const client = { models: { generateContent } } as unknown as Pick<GoogleGenAI, 'models'>;

      await expect(
        new GeminiLanguageModel(client, 'primary', ['backup'], fast).generate(request),
      ).rejects.toThrow();
      expect(generateContent).toHaveBeenCalledTimes(1);
    });
  });
});
