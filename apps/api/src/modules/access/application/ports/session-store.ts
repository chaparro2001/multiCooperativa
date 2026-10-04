import type { SessionState } from '../../domain/session';

export interface StoredSession extends SessionState {
  id: string;
  userId: string;
}

export interface SessionStore {
  /** Returns the id of the new session. */
  create(data: { userId: string; refreshTokenHash: string; expiresAt: Date }): Promise<string>;
  findById(id: string): Promise<StoredSession | null>;
  /**
   * Replaces the refresh token only if `currentHash` is still the current one
   * and the session is not revoked. False means a concurrent use won.
   */
  rotate(
    id: string,
    currentHash: string,
    next: { refreshTokenHash: string; expiresAt: Date },
  ): Promise<boolean>;
  revoke(id: string, at: Date): Promise<void>;
}
