import { authTokensSchema } from '@multicooperativa/contracts';
import type { z } from 'zod';

import { type StoredTokens, type TokenStore, toStoredTokens } from '../auth/token-store';
import { ApiError, NetworkError } from './api-error';

/** Renew a little before expiry, so a request does not leave with a token about to die. */
export const REFRESH_MARGIN_MS = 30_000;

export interface ApiClientDeps {
  baseUrl: string;
  tokens: TokenStore;
  fetch?: typeof fetch;
  now?: () => number;
  /** The session cannot be renewed any more: the app goes back to the login. */
  onSessionEnded?: () => void;
}

export interface RequestOptions<S extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON-serializable, or a FormData for file uploads. */
  body?: unknown;
  /** Validates the answer against its contract; omit for 204 responses. */
  schema?: S;
  /** False for the endpoints that work without a session. */
  auth?: boolean;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * HTTP client of the app. Sends the access token, renews it with the refresh
 * token when it expires (HU-ACC-03) and never renews twice at once: the API
 * revokes the whole session when a refresh token is replayed.
 */
export function createApiClient(deps: ApiClientDeps) {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  let refreshing: Promise<StoredTokens | null> | null = null;

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(`${deps.baseUrl}${path}`, init);
    } catch (error) {
      throw new NetworkError(error);
    }
  }

  async function endSession(): Promise<null> {
    await deps.tokens.clear();
    deps.onSessionEnded?.();
    return null;
  }

  /**
   * Single flight. `staleAccessToken` is the token that just failed: if the
   * stored one is already different, another request renewed it meanwhile.
   */
  function refresh(staleAccessToken: string): Promise<StoredTokens | null> {
    refreshing ??= (async () => {
      const current = await deps.tokens.load();
      if (!current) return endSession();
      if (current.accessToken !== staleAccessToken) return current;

      const response = await send('/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (response.status === 401 || response.status === 400) return endSession();
      if (!response.ok) throw await ApiError.fromResponse(response);

      const renewed = toStoredTokens(authTokensSchema.parse(await response.json()), now());
      await deps.tokens.save(renewed);
      return renewed;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<S extends z.ZodType = z.ZodVoid>(
    path: string,
    options: RequestOptions<S> = {},
  ): Promise<z.infer<S>> {
    const { method = 'GET', body, schema, auth = true } = options;
    const unauthenticated = () => new ApiError(401, 'unauthenticated', '');

    let session: StoredTokens | null = null;
    if (auth) {
      session = await deps.tokens.load();
      if (!session) throw unauthenticated();
      if (session.accessTokenExpiresAt - now() < REFRESH_MARGIN_MS) {
        session = await refresh(session.accessToken);
        if (!session) throw unauthenticated();
      }
    }

    // Files go as multipart: fetch sets the boundary in Content-Type itself.
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const call = (tokens: StoredTokens | null) =>
      send(path, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined && !multipart && { 'Content-Type': 'application/json' }),
          ...(tokens && { Authorization: `Bearer ${tokens.accessToken}` }),
        },
        body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
      });

    let response = await call(session);
    if (response.status === 401 && session) {
      // Expired early, or the session was closed elsewhere: one renewal, one retry.
      session = await refresh(session.accessToken);
      if (!session) throw unauthenticated();
      response = await call(session);
      if (response.status === 401) await endSession();
    }

    if (!response.ok) throw await ApiError.fromResponse(response);
    if (!schema || response.status === 204) return undefined as z.infer<S>;
    return schema.parse(await response.json());
  }

  return { request };
}
