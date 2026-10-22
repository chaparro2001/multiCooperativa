import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeError, log } from './log';

afterEach(() => vi.restoreAllMocks());

describe('log', () => {
  it.each([
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
  ] as const)('writes one JSON line for %s', (level, method) => {
    const spy = vi.spyOn(console, method).mockImplementation(() => {});

    log[level]('some_event', { count: 2 });

    expect(spy).toHaveBeenCalledOnce();
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({
      level,
      event: 'some_event',
      count: 2,
    });
  });

  it('describes an Error by its stack and anything else as is', () => {
    expect(describeError(new Error('boom'))).toContain('boom');
    expect(describeError('plain')).toBe('plain');
  });
});
