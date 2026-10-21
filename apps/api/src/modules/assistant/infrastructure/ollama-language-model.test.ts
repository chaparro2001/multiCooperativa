import { describe, expect, it, vi } from 'vitest';

import { OllamaLanguageModel, OllamaLanguageModelError } from './ollama-language-model';

const request = {
  system: 'system prompt',
  messages: [{ role: 'user' as const, content: 'hello' }],
  tools: [
    {
      name: 'search_documents',
      description: 'Searches',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    },
  ],
};

function fakeFetch(body: unknown, init: { status?: number } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const doFetch = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return new Response(JSON.stringify(body), { status: init.status ?? 200 });
  }) as unknown as typeof fetch;
  return { doFetch, calls };
}

const model = (doFetch: typeof fetch) =>
  new OllamaLanguageModel({ url: 'http://ollama:11434/', model: 'qwen3:4b' }, doFetch);

describe('OllamaLanguageModel (NFR-AI-02, ADR-013)', () => {
  it('posts the system prompt, history and tools to /api/chat, not streamed and without thinking', async () => {
    const { doFetch, calls } = fakeFetch({ message: { content: 'Hola' }, done_reason: 'stop' });

    const turn = await model(doFetch).generate(request);

    expect(calls[0]?.url).toBe('http://ollama:11434/api/chat');
    expect(calls[0]?.body).toMatchObject({
      model: 'qwen3:4b',
      stream: false,
      think: false,
      messages: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'hello' },
      ],
      tools: [
        {
          type: 'function',
          function: { name: 'search_documents', description: 'Searches' },
        },
      ],
    });
    expect(turn).toMatchObject({ text: 'Hola', toolCalls: [], stopReason: 'end_turn' });
  });

  it('maps tool calls and numbers them by position', async () => {
    const { doFetch } = fakeFetch({
      message: {
        content: '',
        tool_calls: [{ function: { name: 'search_documents', arguments: { query: 'water' } } }],
      },
      prompt_eval_count: 40,
      eval_count: 9,
    });

    const turn = await model(doFetch).generate(request);

    expect(turn.stopReason).toBe('tool_use');
    expect(turn.toolCalls).toEqual([
      { id: 'call_1', name: 'search_documents', input: { query: 'water' } },
    ]);
    expect(turn.usage).toEqual({ inputTokens: 40, outputTokens: 9 });
  });

  it('accepts arguments sent as a JSON string', async () => {
    const { doFetch } = fakeFetch({
      message: {
        content: '',
        tool_calls: [{ function: { name: 'search_documents', arguments: '{"query":"a"}' } }],
      },
    });
    expect((await model(doFetch).generate(request)).toolCalls[0]?.input).toEqual({ query: 'a' });
  });

  it('sends the assistant turn and the tool results back in the loop', async () => {
    const { doFetch, calls } = fakeFetch({ message: { content: 'Listo' } });
    const first = fakeFetch({
      message: {
        content: '',
        tool_calls: [{ function: { name: 'search_documents', arguments: { query: 'a' } } }],
      },
    });
    const turn = await model(first.doFetch).generate(request);

    await model(doFetch).generate({
      ...request,
      messages: [
        ...request.messages,
        { role: 'assistant', content: turn.text, raw: turn.raw },
        {
          role: 'tool_results',
          results: [
            { callId: 'call_1', name: 'search_documents', content: 'data', isError: false },
          ],
        },
        {
          role: 'tool_results',
          results: [{ callId: 'call_2', name: 'search_documents', content: 'bad', isError: true }],
        },
      ],
    });

    const sent = calls[0]?.body.messages as { role: string }[];
    expect(sent[2]).toMatchObject({ role: 'assistant', tool_calls: [{}] });
    expect(sent[3]).toEqual({ role: 'tool', tool_name: 'search_documents', content: 'data' });
    expect(sent[4]).toEqual({ role: 'tool', tool_name: 'search_documents', content: 'error: bad' });
  });

  it('drops the think block that a reasoning model leaves in the content', async () => {
    const { doFetch } = fakeFetch({ message: { content: 'hmm, thinking\n</think>\nHola' } });
    expect((await model(doFetch).generate(request)).text).toBe('Hola');
  });

  it('reports a cut-off answer as max_tokens', async () => {
    const { doFetch } = fakeFetch({ message: { content: 'Hol' }, done_reason: 'length' });
    expect((await model(doFetch).generate(request)).stopReason).toBe('max_tokens');
  });

  it('fails when the model calls a tool that does not exist', async () => {
    const { doFetch } = fakeFetch({
      message: { content: '', tool_calls: [{ function: { name: 'drop_tables', arguments: {} } }] },
    });
    await expect(model(doFetch).generate(request)).rejects.toThrow(OllamaLanguageModelError);
  });

  it('fails when the model writes the tool call as text', async () => {
    const { doFetch } = fakeFetch({
      message: { content: '{"name": "search_documents", "arguments": {"query": "a"}}' },
    });
    await expect(model(doFetch).generate(request)).rejects.toThrow(/as text/);
  });

  it('fails with malformed string arguments', async () => {
    const { doFetch } = fakeFetch({
      message: {
        content: '',
        tool_calls: [{ function: { name: 'search_documents', arguments: '{oops' } }],
      },
    });
    await expect(model(doFetch).generate(request)).rejects.toThrow(/malformed/);
  });

  it('fails on an HTTP error, on a network error and on an unreadable body', async () => {
    await expect(model(fakeFetch({}, { status: 404 }).doFetch).generate(request)).rejects.toThrow(
      /404/,
    );
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(model(down).generate(request)).rejects.toThrow(/Cannot reach/);
    const garbage = vi.fn(async () => new Response('<html>')) as unknown as typeof fetch;
    await expect(model(garbage).generate(request)).rejects.toThrow(/Unreadable/);
  });

  it('omits the tools field when there are none', async () => {
    const { doFetch, calls } = fakeFetch({ message: { content: 'x' } });
    await model(doFetch).generate({ ...request, tools: [] });
    expect(calls[0]?.body).not.toHaveProperty('tools');
  });
});
