import { describe, expect, it } from 'vitest';

import {
  HostedProviderError,
  HostedProviderKeyInvalidError,
  HostedProviderTransientError,
} from '../application/ports/hosted-provider';
import type { ModelRequest } from '../application/ports/language-model';
import { OpenAICompatibleGateway } from './openai-compatible-gateway';
import { OpenAICompatibleLanguageModel } from './openai-compatible-language-model';

/** US-AI-07, ADR-018: the hosted adapter, with a fake fetch (no network). */

const API_KEY = 'gsk_super-secret-key-0000';
const BASE_URL = 'https://api.example.test/openai/v1';

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const doFetch = (async (url: string | URL, init: RequestInit = {}) => {
    const call = {
      url: String(url),
      init,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {},
    };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { doFetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const request: ModelRequest = {
  system: 'You are an assistant.',
  messages: [{ role: 'user', content: 'How many invoices are pending?' }],
  tools: [
    {
      name: 'list_invoices',
      description: 'Lists invoices.',
      inputSchema: { type: 'object', properties: { status: { type: 'string' } } },
    },
  ],
};

const model = (doFetch: typeof fetch) =>
  new OpenAICompatibleLanguageModel(
    { baseUrl: BASE_URL, model: 'openai/gpt-oss-20b', apiKey: API_KEY },
    doFetch,
  );

describe('OpenAICompatibleLanguageModel', () => {
  it('posts to /chat/completions with the bearer key, the model, the history and the tools', async () => {
    const { doFetch, calls } = fakeFetch(() =>
      json({
        choices: [{ message: { role: 'assistant', content: 'Three.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }),
    );
    const turn = await model(doFetch).generate(request);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE_URL}/chat/completions`);
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${API_KEY}`,
    );
    expect(calls[0]?.body).toMatchObject({
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'system', content: 'You are an assistant.' },
        { role: 'user', content: 'How many invoices are pending?' },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'list_invoices',
            description: 'Lists invoices.',
            parameters: request.tools[0]?.inputSchema,
          },
        },
      ],
    });
    expect(turn).toMatchObject({
      text: 'Three.',
      toolCalls: [],
      stopReason: 'end_turn',
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it('turns tool calls into the port types, parsing the JSON arguments', async () => {
    const { doFetch } = fakeFetch(() =>
      json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'list_invoices', arguments: '{"status":"pending"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
    const turn = await model(doFetch).generate(request);
    expect(turn.stopReason).toBe('tool_use');
    expect(turn.toolCalls).toEqual([
      { id: 'call_abc', name: 'list_invoices', input: { status: 'pending' } },
    ]);
  });

  it('sends the tool results and the provider message back in the tool loop', async () => {
    const first = fakeFetch(() =>
      json({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call_abc', function: { name: 'list_invoices', arguments: '{}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
    const turn = await model(first.doFetch).generate(request);

    const second = fakeFetch(() =>
      json({
        choices: [{ message: { role: 'assistant', content: 'Done.' }, finish_reason: 'stop' }],
      }),
    );
    await model(second.doFetch).generate({
      ...request,
      messages: [
        ...request.messages,
        { role: 'assistant', content: turn.text, raw: turn.raw },
        {
          role: 'tool_results',
          results: [{ callId: 'call_abc', name: 'list_invoices', content: '[]', isError: false }],
        },
      ],
    });
    const messages = second.calls[0]?.body.messages as Record<string, unknown>[];
    expect(messages[2]).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'call_abc' }],
    });
    expect(messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_abc', content: '[]' });
  });

  it('maps length and content filter to max_tokens and refusal', async () => {
    const turnFor = async (finish: string) => {
      const { doFetch } = fakeFetch(() =>
        json({ choices: [{ message: { content: 'x' }, finish_reason: finish }] }),
      );
      return model(doFetch).generate(request);
    };
    expect((await turnFor('length')).stopReason).toBe('max_tokens');
    expect((await turnFor('content_filter')).stopReason).toBe('refusal');
  });

  it.each([401, 403])('maps %i to a key-invalid error', async (status) => {
    const { doFetch } = fakeFetch(() => json({ error: 'nope' }, status));
    await expect(model(doFetch).generate(request)).rejects.toBeInstanceOf(
      HostedProviderKeyInvalidError,
    );
  });

  it.each([429, 500, 503])('maps %i to a transient error', async (status) => {
    const { doFetch } = fakeFetch(() => json({ error: 'busy' }, status));
    await expect(model(doFetch).generate(request)).rejects.toBeInstanceOf(
      HostedProviderTransientError,
    );
  });

  it('maps a network failure and a timeout to a transient error', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await expect(model(down).generate(request)).rejects.toBeInstanceOf(
      HostedProviderTransientError,
    );
    const slow = (async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as typeof fetch;
    await expect(model(slow).generate(request)).rejects.toBeInstanceOf(
      HostedProviderTransientError,
    );
  });

  it('rejects malformed tool arguments and unknown tools', async () => {
    const withCall = (name: string, args: string) =>
      fakeFetch(() =>
        json({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [{ id: 'c', function: { name, arguments: args } }],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }),
      ).doFetch;
    await expect(
      model(withCall('list_invoices', '{oops')).generate(request),
    ).rejects.toBeInstanceOf(HostedProviderError);
    await expect(model(withCall('drop_tables', '{}')).generate(request)).rejects.toBeInstanceOf(
      HostedProviderError,
    );
  });

  it('never puts the API key in an error message', async () => {
    const failures: unknown[] = [];
    for (const doFetch of [
      fakeFetch(() => json({}, 401)).doFetch,
      fakeFetch(() => json({}, 500)).doFetch,
      (async () => {
        throw new TypeError(`fetch failed for key ${API_KEY}`);
      }) as typeof fetch,
    ]) {
      failures.push(
        await model(doFetch)
          .generate(request)
          .catch((error: unknown) => error),
      );
    }
    for (const failure of failures) {
      expect(JSON.stringify(failure) + String((failure as Error).message)).not.toContain(API_KEY);
      expect((failure as Error).cause).toBeUndefined();
    }
  });
});

describe('OpenAICompatibleGateway', () => {
  it('lists the model ids of the fixed provider URL with the key', async () => {
    const { doFetch, calls } = fakeFetch(() => json({ data: [{ id: 'a/b' }, { id: 'c' }, {}] }));
    const models = await new OpenAICompatibleGateway(doFetch).listModels('groq', API_KEY);
    expect(models).toEqual(['a/b', 'c']);
    expect(calls[0]?.url).toBe('https://api.groq.com/openai/v1/models');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${API_KEY}`,
    );
  });

  it('maps 401 to key-invalid and other failures to another provider error', async () => {
    await expect(
      new OpenAICompatibleGateway(fakeFetch(() => json({}, 401)).doFetch).listModels(
        'groq',
        API_KEY,
      ),
    ).rejects.toBeInstanceOf(HostedProviderKeyInvalidError);
    await expect(
      new OpenAICompatibleGateway(fakeFetch(() => json({}, 502)).doFetch).listModels(
        'groq',
        API_KEY,
      ),
    ).rejects.toBeInstanceOf(HostedProviderTransientError);
  });

  it('builds a chat model on the catalog URL of the provider', async () => {
    const { doFetch, calls } = fakeFetch(() =>
      json({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
    );
    await new OpenAICompatibleGateway(doFetch)
      .createModel('mistral', 'mistral-small-latest', API_KEY)
      .generate(request);
    expect(calls[0]?.url).toBe('https://api.mistral.ai/v1/chat/completions');
  });
});
