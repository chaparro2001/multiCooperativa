import { describe, expect, it, vi } from 'vitest';

import { OllamaModelRuntime, TAGS_CACHE_MS } from './ollama-model-runtime';

const tags = (...names: string[]) =>
  new Response(JSON.stringify({ models: names.map((name) => ({ name })) }));

function runtimeWith(fetchImpl: typeof fetch, now = () => 0) {
  return new OllamaModelRuntime({
    url: 'http://ollama:11434',
    defaultModel: 'qwen3:8b',
    models: ['qwen3:4b-instruct'],
    fetch: fetchImpl,
    now,
  });
}

describe('OllamaModelRuntime (US-AI-07, ADR-014)', () => {
  it('always allows the default model, even when the allowlist omits it', () => {
    expect(runtimeWith(vi.fn()).allowed).toEqual(['qwen3:8b', 'qwen3:4b-instruct']);
  });

  it('lists the installed models from /api/tags and never calls anything else', async () => {
    const fetchMock = vi.fn(async () => tags('qwen3:8b', 'bge-m3:latest'));
    expect(await runtimeWith(fetchMock as unknown as typeof fetch).installed()).toEqual([
      'qwen3:8b',
      'bge-m3:latest',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(url.pathname).toBe('/api/tags');
  });

  it('caches the list briefly', async () => {
    let clock = 0;
    const fetchMock = vi.fn(async () => tags('qwen3:8b'));
    const runtime = runtimeWith(fetchMock as unknown as typeof fetch, () => clock);
    await runtime.installed();
    await runtime.installed();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock = TAGS_CACHE_MS + 1;
    await runtime.installed();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('answers null when Ollama cannot be reached or answers an error', async () => {
    expect(
      await runtimeWith((async () =>
        Promise.reject(new Error('down'))) as typeof fetch).installed(),
    ).toBeNull();
    expect(
      await runtimeWith(
        (async () => new Response('x', { status: 500 })) as typeof fetch,
      ).installed(),
    ).toBeNull();
  });

  it('reuses one chat model per id', () => {
    const runtime = runtimeWith(vi.fn());
    expect(runtime.create('qwen3:8b')).toBe(runtime.create('qwen3:8b'));
    expect(runtime.create('qwen3:8b')).not.toBe(runtime.create('qwen3:4b-instruct'));
  });
});
