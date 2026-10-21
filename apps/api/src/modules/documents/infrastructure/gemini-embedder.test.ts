import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS, EmbeddingUnavailableError } from '../application/ports/embedder';
import {
  BATCH_SIZE,
  GeminiEmbedder,
  PARALLEL_REQUESTS,
  type GeminiEmbeddingClient,
} from './gemini-embedder';

type Params = Parameters<GeminiEmbeddingClient['models']['embedContent']>[0];

function fakeClient(dimensions = EMBEDDING_DIMENSIONS, scale = 3) {
  const requests: Params[] = [];
  const client: GeminiEmbeddingClient = {
    models: {
      async embedContent(params) {
        requests.push(params);
        return {
          embeddings: params.contents.map((_, i) => ({
            values: new Array<number>(dimensions).fill(scale * (i + 1)),
          })),
        };
      },
    },
  };
  return { client, requests };
}

const norm = (v: number[]) => Math.hypot(...v);

describe('GeminiEmbedder (ADR-010)', () => {
  it('asks for 1024 dimensions and returns one L2-normalized vector per text, in order', async () => {
    const { client, requests } = fakeClient();

    const vectors = await new GeminiEmbedder(client).embed(['uno', 'dos']);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.model).toBe('gemini-embedding-2');
    expect(requests[0]?.config?.outputDimensionality).toBe(EMBEDDING_DIMENSIONS);
    expect(vectors).toHaveLength(2);
    for (const vector of vectors) {
      expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(norm(vector)).toBeCloseTo(1, 6);
    }
  });

  it('gemini-embedding-2 has no task type: document and query roles go in a text prefix', async () => {
    const { client, requests } = fakeClient();
    const embedder = new GeminiEmbedder(client);

    await embedder.embed(['fragment']);
    await embedder.embed(['question'], 'query');

    expect(requests[0]?.contents).toEqual(['title: none | text: fragment']);
    expect(requests[1]?.contents).toEqual(['task: search result | query: question']);
    expect(requests[0]?.config?.taskType).toBeUndefined();
  });

  it('gemini-embedding-001 uses the task type and sends the text untouched', async () => {
    const { client, requests } = fakeClient();
    const embedder = new GeminiEmbedder(client, 'gemini-embedding-001');

    await embedder.embed(['fragment']);
    await embedder.embed(['question'], 'query');

    expect(requests.map((r) => r.contents)).toEqual([['fragment'], ['question']]);
    expect(requests.map((r) => r.config?.taskType)).toEqual([
      'RETRIEVAL_DOCUMENT',
      'RETRIEVAL_QUERY',
    ]);
  });

  it('gemini-embedding-2 gets one text per request, because it fuses a list into one vector', async () => {
    const { client, requests } = fakeClient();
    const texts = Array.from({ length: PARALLEL_REQUESTS + 3 }, (_, i) => `t${i}`);

    const vectors = await new GeminiEmbedder(client).embed(texts);

    expect(requests.map((r) => r.contents.length)).toEqual(texts.map(() => 1));
    expect(requests.map((r) => r.contents[0])).toEqual(
      texts.map((t) => `title: none | text: ${t}`),
    );
    expect(vectors).toHaveLength(texts.length);
  });

  it('gemini-embedding-001 groups the texts in batches', async () => {
    const { client, requests } = fakeClient();
    const texts = Array.from({ length: BATCH_SIZE + 3 }, (_, i) => `t${i}`);

    const vectors = await new GeminiEmbedder(client, 'gemini-embedding-001').embed(texts);

    expect(requests.map((r) => r.contents.length)).toEqual([BATCH_SIZE, 3]);
    expect(vectors).toHaveLength(BATCH_SIZE + 3);
  });

  it('fails clearly if the model does not return 1024 dimensions', async () => {
    const { client } = fakeClient(768);

    await expect(new GeminiEmbedder(client).embed(['x'])).rejects.toThrow(
      /does not produce 1024-dimension vectors/,
    );
  });

  it('wraps client failures and count mismatches in EmbeddingUnavailableError', async () => {
    const failing: GeminiEmbeddingClient = {
      models: {
        async embedContent() {
          throw new Error('429');
        },
      },
    };
    const empty: GeminiEmbeddingClient = { models: { embedContent: async () => ({}) } };

    await expect(new GeminiEmbedder(failing).embed(['x'])).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
    await expect(new GeminiEmbedder(empty).embed(['x'])).rejects.toBeInstanceOf(
      EmbeddingUnavailableError,
    );
  });

  it('retries an overloaded service and keeps the same model (ADR-010)', async () => {
    const { client, requests } = fakeClient();
    const embedContent = client.models.embedContent.bind(client.models);
    let failures = 2;
    client.models.embedContent = async (params) => {
      if (failures-- > 0)
        throw Object.assign(new Error('{"status":"UNAVAILABLE"}'), { status: 503 });
      return embedContent(params);
    };
    const fast = { sleep: async () => undefined, onRetry: () => undefined };

    const vectors = await new GeminiEmbedder(client, 'gemini-embedding-2', fast).embed(['x']);

    expect(vectors).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.model).toBe('gemini-embedding-2');
  });

  it('gives up with EmbeddingUnavailableError when the overload persists', async () => {
    let calls = 0;
    const client: GeminiEmbeddingClient = {
      models: {
        async embedContent() {
          calls++;
          throw Object.assign(new Error('x'), { status: 503 });
        },
      },
    };
    const fast = { sleep: async () => undefined, onRetry: () => undefined };

    await expect(
      new GeminiEmbedder(client, 'gemini-embedding-2', fast).embed(['x']),
    ).rejects.toBeInstanceOf(EmbeddingUnavailableError);
    expect(calls).toBe(4);
  });
});
