import { describe, expect, it } from 'vitest';

import { type StringStorage, WebSessionKeyValueStore } from './key-value-store';

function fakeStorage(): StringStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('WebSessionKeyValueStore (web build)', () => {
  it('keeps values in the session storage and removes them', async () => {
    const storage = fakeStorage();
    const store = new WebSessionKeyValueStore(() => storage);

    await store.set('session', 'tokens');
    expect(storage.data.get('session')).toBe('tokens');
    expect(await store.get('session')).toBe('tokens');

    await store.remove('session');
    expect(await store.get('session')).toBeNull();
  });

  it('degrades to memory when the storage is blocked', async () => {
    const store = new WebSessionKeyValueStore(() => {
      throw new Error('SecurityError');
    });

    await store.set('session', 'tokens');
    expect(await store.get('session')).toBe('tokens');
    await store.remove('session');
    expect(await store.get('session')).toBeNull();
  });

  it('degrades to memory when writing throws (quota, private mode)', async () => {
    const storage: StringStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    const store = new WebSessionKeyValueStore(() => storage);

    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
  });
});
