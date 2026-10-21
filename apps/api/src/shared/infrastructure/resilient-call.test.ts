import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  callWithFallback,
  isTransientError,
  modelChain,
  requestedDelayMs,
  type RetryEvent,
} from './resilient-call';

class FakeApiError extends Error {
  constructor(
    readonly status: number,
    message = '{}',
  ) {
    super(message);
  }
}

const overloaded = () =>
  new FakeApiError(503, '{"error":{"code":503,"message":"high demand","status":"UNAVAILABLE"}}');

/** Fake clock: sleeping advances it, nothing really waits. */
function harness() {
  let clock = 0;
  const events: RetryEvent[] = [];
  const sleeps: number[] = [];
  return {
    events,
    sleeps,
    settings: {
      sleep: async (ms: number) => {
        sleeps.push(ms);
        clock += ms;
      },
      now: () => clock,
      random: () => 1,
      onRetry: (event: RetryEvent) => events.push(event),
    },
  };
}

describe('isTransientError (ADR-009)', () => {
  it.each([429, 500, 502, 503, 504])('retries HTTP %i', (status) => {
    expect(isTransientError(new FakeApiError(status))).toBe(true);
  });

  it.each([400, 401, 403, 404])('does not retry HTTP %i', (status) => {
    expect(isTransientError(new FakeApiError(status))).toBe(false);
  });

  it('recognizes the status text when there is no numeric status', () => {
    expect(isTransientError(new Error('{"status":"RESOURCE_EXHAUSTED"}'))).toBe(true);
    expect(isTransientError(new Error('{"status":"UNAVAILABLE"}'))).toBe(true);
  });

  it('recognizes network errors but not programming errors', () => {
    const fetchFailed = new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
    expect(isTransientError(fetchFailed)).toBe(true);
    expect(isTransientError(new TypeError('fetch failed'))).toBe(true);
    expect(isTransientError(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isTransientError(new TypeError('x is not a function'))).toBe(false);
    expect(isTransientError('boom')).toBe(false);
  });
});

describe('requestedDelayMs', () => {
  it('reads Retry-After in seconds', () => {
    const error = Object.assign(new Error('x'), {
      headers: new Headers({ 'retry-after': '3' }),
    });
    expect(requestedDelayMs(error)).toBe(3000);
  });

  it('reads the retryDelay of the error body', () => {
    expect(requestedDelayMs(new Error('{"retryDelay":"7s"}'))).toBe(7000);
    expect(requestedDelayMs(new Error('nothing'))).toBeUndefined();
  });
});

describe('callWithFallback (ADR-009, ADR-010)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the first success without waiting', async () => {
    const { settings, sleeps } = harness();
    const call = vi.fn(async () => 'ok');

    await expect(callWithFallback(['a'], call, settings)).resolves.toBe('ok');
    expect(call).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('retries a transient error with exponential backoff and then succeeds', async () => {
    const { settings, sleeps, events } = harness();
    const call = vi
      .fn<(model: string) => Promise<string>>()
      .mockRejectedValueOnce(overloaded())
      .mockRejectedValueOnce(overloaded())
      .mockResolvedValue('ok');

    await expect(callWithFallback(['a'], call, settings)).resolves.toBe('ok');
    expect(call).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 2000]);
    expect(events.map((event) => event.status)).toEqual([503, 503]);
    expect(JSON.stringify(events)).not.toContain('high demand');
  });

  it('applies jitter within half to full of the backoff', async () => {
    const { settings, sleeps } = harness();
    const call = vi
      .fn<(model: string) => Promise<string>>()
      .mockRejectedValueOnce(overloaded())
      .mockResolvedValue('ok');

    await callWithFallback(['a'], call, { ...settings, random: () => 0 });
    expect(sleeps).toEqual([500]);
  });

  it('does not retry a permanent error', async () => {
    const { settings, sleeps } = harness();
    const call = vi.fn(async () => {
      throw new FakeApiError(400);
    });

    await expect(callWithFallback(['a', 'b'], call, settings)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('throws the last error once the attempts are exhausted', async () => {
    const { settings } = harness();
    const call = vi.fn(async () => {
      throw overloaded();
    });

    await expect(callWithFallback(['a'], call, settings)).rejects.toMatchObject({ status: 503 });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('moves to the fallback model when the primary keeps failing', async () => {
    const { settings, events } = harness();
    const call = vi.fn(async (model: string) => {
      if (model === 'primary') throw overloaded();
      return `answer from ${model}`;
    });

    await expect(callWithFallback(['primary', 'backup'], call, settings)).resolves.toBe(
      'answer from backup',
    );
    expect(call.mock.calls.map(([model]) => model)).toEqual([
      'primary',
      'primary',
      'primary',
      'backup',
    ]);
    expect(events.at(-1)).toMatchObject({ model: 'primary', nextModel: 'backup', delayMs: 0 });
  });

  it('honors the delay requested by the server', async () => {
    const { settings, sleeps } = harness();
    const call = vi
      .fn<(model: string) => Promise<string>>()
      .mockRejectedValueOnce(new FakeApiError(429, '{"retryDelay":"5s"}'))
      .mockResolvedValue('ok');

    await callWithFallback(['a'], call, settings);
    expect(sleeps).toEqual([5000]);
  });

  it('skips to the next model when the requested delay is longer than a single wait may be', async () => {
    const { settings, sleeps } = harness();
    const call = vi.fn(async (model: string) => {
      if (model === 'a') throw new FakeApiError(429, '{"retryDelay":"60s"}');
      return 'from b';
    });

    await expect(callWithFallback(['a', 'b'], call, settings)).resolves.toBe('from b');
    expect(call).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([]);
  });

  it('waits with the real timers by default', async () => {
    const call = vi
      .fn<(model: string) => Promise<string>>()
      .mockRejectedValueOnce(overloaded())
      .mockResolvedValue('ok');
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = callWithFallback(['a'], call, { random: () => 1 });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toBe('ok');
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('gives up when the total time budget is spent', async () => {
    const { settings, sleeps } = harness();
    const call = vi.fn(async () => {
      throw overloaded();
    });

    await expect(
      callWithFallback(['a'], call, {
        ...settings,
        attemptsPerModel: 10,
        baseDelayMs: 4000,
        maxDelayMs: 8000,
        maxTotalMs: 12_000,
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(sleeps.reduce((sum, ms) => sum + ms, 0)).toBeLessThan(12_000);
  });
});

describe('modelChain', () => {
  it('puts the primary first and drops repeats', () => {
    expect(modelChain('a', ['b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    expect(modelChain('a')).toEqual(['a']);
  });
});
