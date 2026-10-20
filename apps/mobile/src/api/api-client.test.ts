import { z } from 'zod';
import { beforeEach, describe, expect, it } from 'vitest';

import { TokenStore } from '../auth/token-store';
import { MemoryKeyValueStore } from '../storage/key-value-store';
import { createApiClient } from './api-client';
import { ApiError, NetworkError } from './api-error';

const BASE = 'https://api.test';
const T0 = 1_000_000;

/**
 * Minimal API: rotates refresh tokens and, like the real one, revokes the
 * session when an old refresh token is replayed (US-ACC-03).
 */
class FakeApi {
  validAccess = new Set(['access-1']);
  currentRefresh = 'refresh-1';
  revoked = false;
  refreshCalls = 0;
  private generation = 1;

  fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const path = String(url).replace(BASE, '');
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    if (path === '/auth/refresh') {
      this.refreshCalls++;
      const { refreshToken } = JSON.parse(String(init?.body));
      if (this.revoked || refreshToken !== this.currentRefresh) {
        this.revoked = true;
        return json(401, { error: 'invalid_refresh_token' });
      }
      this.generation++;
      this.currentRefresh = `refresh-${this.generation}`;
      this.validAccess = new Set([`access-${this.generation}`]);
      return json(200, {
        accessToken: `access-${this.generation}`,
        accessTokenExpiresIn: 900,
        refreshToken: this.currentRefresh,
      });
    }

    const auth = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '');
    if (!auth || this.revoked || !this.validAccess.has(auth)) {
      return json(401, { error: 'unauthenticated' });
    }
    if (path === '/empty') return new Response(null, { status: 204 });
    if (path === '/forbidden') return json(403, { error: 'forbidden', message: 'No.' });
    return json(200, { ok: true, token: auth });
  };
}

const okSchema = z.object({ ok: z.boolean(), token: z.string() });

let api: FakeApi;
let tokens: TokenStore;
let now: number;
let ended: number;

function client() {
  return createApiClient({
    baseUrl: BASE,
    tokens,
    fetch: api.fetch as typeof fetch,
    now: () => now,
    onSessionEnded: () => void ended++,
  });
}

beforeEach(async () => {
  api = new FakeApi();
  tokens = new TokenStore(new MemoryKeyValueStore());
  now = T0;
  ended = 0;
  await tokens.save({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessTokenExpiresAt: T0 + 900_000,
  });
});

describe('API client (US-ACC-03)', () => {
  it('sends the access token and validates the response against its contract', async () => {
    await expect(client().request('/data', { schema: okSchema })).resolves.toEqual({
      ok: true,
      token: 'access-1',
    });
    expect(api.refreshCalls).toBe(0);
  });

  it('Given an expired access token and a valid refresh token, when a request is made, then it renews without intervention', async () => {
    now = T0 + 900_000;

    const result = await client().request('/data', { schema: okSchema });

    expect(result.token).toBe('access-2');
    expect(await tokens.load()).toMatchObject({ refreshToken: 'refresh-2' });
  });

  it('renews before expiry, with a margin', async () => {
    now = T0 + 900_000 - 10_000;

    await client().request('/data', { schema: okSchema });

    expect(api.refreshCalls).toBe(1);
  });

  it('if the server rejects a token that still looks valid, it renews once and retries', async () => {
    api.validAccess = new Set();

    const result = await client().request('/data', { schema: okSchema });

    expect(result.token).toBe('access-2');
    expect(api.refreshCalls).toBe(1);
  });

  it('simultaneous requests with an expired token renew only once (otherwise the server would revoke the session)', async () => {
    now = T0 + 900_000;
    const c = client();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => c.request('/data', { schema: okSchema })),
    );

    expect(results.every((r) => r.token === 'access-2')).toBe(true);
    expect(api.refreshCalls).toBe(1);
    expect(api.revoked).toBe(false);
  });

  it('simultaneous requests rejected with 401 do not renew twice either', async () => {
    api.validAccess = new Set();
    const c = client();

    await Promise.all(Array.from({ length: 3 }, () => c.request('/data', { schema: okSchema })));

    expect(api.refreshCalls).toBe(1);
    expect(api.revoked).toBe(false);
  });

  it('if it cannot renew, it clears the tokens and reports that the session ended', async () => {
    api.revoked = true;
    now = T0 + 900_000;

    await expect(client().request('/data', { schema: okSchema })).rejects.toMatchObject({
      status: 401,
    });
    expect(await tokens.load()).toBeNull();
    expect(ended).toBe(1);
  });

  it('without a session, an authenticated request fails without calling the API', async () => {
    await tokens.clear();

    await expect(client().request('/data')).rejects.toBeInstanceOf(ApiError);
    expect(api.refreshCalls).toBe(0);
  });

  it('turns API errors into ApiError with their code', async () => {
    const error = await client()
      .request('/forbidden')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden', message: 'No.' });
  });

  it('sends a FormData as is, without forcing JSON, and with the token', async () => {
    let seen: { contentType: string | null; body: unknown; auth: string | null } | undefined;
    const c = createApiClient({
      baseUrl: BASE,
      tokens,
      now: () => now,
      fetch: (async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        seen = {
          contentType: headers.get('Content-Type'),
          body: init?.body,
          auth: headers.get('Authorization'),
        };
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    });
    const form = new FormData();
    form.append('title', 'Minutes');

    await c.request('/upload', { method: 'POST', body: form });

    expect(seen).toEqual({ contentType: null, body: form, auth: 'Bearer access-1' });
  });

  it('a 204 response is not validated', async () => {
    await expect(client().request('/empty', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('without a network, it fails with NetworkError and keeps the session', async () => {
    const offline = createApiClient({
      baseUrl: BASE,
      tokens,
      fetch: (async () => {
        throw new TypeError('Network request failed');
      }) as typeof fetch,
      now: () => T0 + 900_000,
    });

    await expect(offline.request('/data')).rejects.toBeInstanceOf(NetworkError);
    expect(await tokens.load()).not.toBeNull();
  });
});
