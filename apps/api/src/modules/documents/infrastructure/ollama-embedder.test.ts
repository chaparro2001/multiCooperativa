import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIMENSIONS, EmbeddingUnavailableError } from '../application/ports/embedder';
import { BATCH_SIZE, OllamaEmbedder } from './ollama-embedder';

const vector = (value: number) => new Array(EMBEDDING_DIMENSIONS).fill(value);

function fakeOllama(dimensions = EMBEDDING_DIMENSIONS) {
  const requests: { url: string; body: { model: string; input: string[] } }[] = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    requests.push({ url, body });
    return new Response(
      JSON.stringify({
        embeddings: body.input.map((_: string, i: number) => new Array(dimensions).fill(i)),
      }),
    );
  }) as unknown as typeof fetch;
  return { doFetch, requests };
}

describe('OllamaEmbedder (ADR-006)', () => {
  it('calls /api/embed with the configured model and returns one vector per text', async () => {
    const { doFetch, requests } = fakeOllama();
    const embedder = new OllamaEmbedder({ url: 'http://ollama:11434/', model: 'bge-m3' }, doFetch);

    const vectors = await embedder.embed(['uno', 'dos']);

    expect(requests).toEqual([
      { url: 'http://ollama:11434/api/embed', body: { model: 'bge-m3', input: ['uno', 'dos'] } },
    ]);
    expect(vectors).toEqual([vector(0), vector(1)]);
  });

  it('groups the texts in batches and keeps the order', async () => {
    const { doFetch, requests } = fakeOllama();
    const texts = Array.from({ length: BATCH_SIZE + 3 }, (_, i) => `t${i}`);

    const vectors = await new OllamaEmbedder({ url: 'http://o', model: 'm' }, doFetch).embed(texts);

    expect(requests.map((r) => r.body.input.length)).toEqual([BATCH_SIZE, 3]);
    expect(vectors).toHaveLength(BATCH_SIZE + 3);
    expect(vectors[BATCH_SIZE]?.[0]).toBe(0);
  });

  it('fails with a clear message if the model does not have 1024 dimensions', async () => {
    const { doFetch } = fakeOllama(768);

    await expect(
      new OllamaEmbedder({ url: 'http://o', model: 'other' }, doFetch).embed(['x']),
    ).rejects.toThrow(/does not produce 1024-dimension vectors/);
  });

  it('without the service, fails with EmbeddingUnavailableError', async () => {
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    await expect(
      new OllamaEmbedder({ url: 'http://o', model: 'm' }, down).embed(['x']),
    ).rejects.toBeInstanceOf(EmbeddingUnavailableError);
  });

  it('a 404 (model not downloaded) is also EmbeddingUnavailableError', async () => {
    const notFound = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch;

    await expect(
      new OllamaEmbedder({ url: 'http://o', model: 'm' }, notFound).embed(['x']),
    ).rejects.toThrow(/Is the model m downloaded/);
  });
});
