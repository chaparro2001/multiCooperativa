import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDebouncer } from './debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createDebouncer', () => {
  it('emits only the last value after the delay without newer ones', () => {
    const emit = vi.fn();
    const debouncer = createDebouncer(emit, 300);

    debouncer.push('a');
    vi.advanceTimersByTime(200);
    debouncer.push('ab');
    vi.advanceTimersByTime(200);
    expect(emit).not.toHaveBeenCalled();
    debouncer.push('abc');
    vi.advanceTimersByTime(300);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('abc');
  });

  it('emits again for a value typed after the previous one settled', () => {
    const emit = vi.fn();
    const debouncer = createDebouncer(emit, 300);

    debouncer.push('a');
    vi.advanceTimersByTime(300);
    debouncer.push('b');
    vi.advanceTimersByTime(300);

    expect(emit.mock.calls).toEqual([['a'], ['b']]);
  });

  it('cancel drops the pending value', () => {
    const emit = vi.fn();
    const debouncer = createDebouncer(emit, 300);

    debouncer.push('a');
    debouncer.cancel();
    vi.advanceTimersByTime(1000);

    expect(emit).not.toHaveBeenCalled();
  });
});
