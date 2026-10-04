import type { AuthTokens } from '@multicooperativa/contracts';
import { z } from 'zod';

import type { KeyValueStore } from '../storage/key-value-store';

const KEY = 'session';

const storedTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Epoch milliseconds. */
  accessTokenExpiresAt: z.number(),
});

export type StoredTokens = z.infer<typeof storedTokensSchema>;

export function toStoredTokens(tokens: AuthTokens, now: number): StoredTokens {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessTokenExpiresAt: now + tokens.accessTokenExpiresIn * 1000,
  };
}

/** The session's tokens, in the device's secure storage. */
export class TokenStore {
  constructor(private readonly store: KeyValueStore) {}

  async load(): Promise<StoredTokens | null> {
    const raw = await this.store.get(KEY);
    if (!raw) return null;
    try {
      return storedTokensSchema.parse(JSON.parse(raw));
    } catch {
      // Unreadable (e.g. an older format): as if there were no session.
      await this.clear();
      return null;
    }
  }

  save(tokens: StoredTokens): Promise<void> {
    return this.store.set(KEY, JSON.stringify(tokens));
  }

  clear(): Promise<void> {
    return this.store.remove(KEY);
  }
}
