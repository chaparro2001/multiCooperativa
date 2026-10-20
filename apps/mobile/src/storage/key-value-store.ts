/** Small string values the app keeps between launches. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Tests and web, where the device's secure storage does not exist. Nothing survives a reload. */
export class MemoryKeyValueStore implements KeyValueStore {
  private readonly values = new Map<string, string>();

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.values.set(key, value);
  }

  async remove(key: string) {
    this.values.delete(key);
  }
}

/** The slice of `Storage` used, so tests can inject a fake. */
export type StringStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Web: the session survives a page reload but not closing the tab (sessionStorage), the
 * closest to the device's secure storage that a browser offers. If the storage is blocked
 * (private mode, disabled cookies) it degrades to memory. Meant for the demo build; tokens
 * stay readable by scripts of the same origin, unlike Keychain/Keystore.
 */
export class WebSessionKeyValueStore implements KeyValueStore {
  private readonly fallback = new MemoryKeyValueStore();

  constructor(private readonly storage: () => StringStorage | undefined) {}

  private available(): StringStorage | undefined {
    try {
      return this.storage();
    } catch {
      return undefined;
    }
  }

  async get(key: string) {
    try {
      const storage = this.available();
      const stored = storage?.getItem(key);
      if (stored !== null && stored !== undefined) return stored;
    } catch {
      // Falls through to memory.
    }
    return this.fallback.get(key);
  }

  async set(key: string, value: string) {
    try {
      const storage = this.available();
      if (storage) {
        storage.setItem(key, value);
        return;
      }
    } catch {
      // Falls through to memory.
    }
    await this.fallback.set(key, value);
  }

  async remove(key: string) {
    try {
      this.available()?.removeItem(key);
    } catch {
      // Nothing stored there to remove.
    }
    await this.fallback.remove(key);
  }
}
