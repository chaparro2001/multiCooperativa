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
 * session when an old refresh token is replayed (HU-ACC-03).
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
    if (path === '/vacio') return new Response(null, { status: 204 });
    if (path === '/prohibido') return json(403, { error: 'forbidden', message: 'No.' });
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

describe('cliente del API (HU-ACC-03)', () => {
  it('envía el token de acceso y valida la respuesta con su contrato', async () => {
    await expect(client().request('/datos', { schema: okSchema })).resolves.toEqual({
      ok: true,
      token: 'access-1',
    });
    expect(api.refreshCalls).toBe(0);
  });

  it('Dado el token de acceso caducado y el de refresco vigente, cuando hace una petición, entonces renueva sin intervención', async () => {
    now = T0 + 900_000;

    const result = await client().request('/datos', { schema: okSchema });

    expect(result.token).toBe('access-2');
    expect(await tokens.load()).toMatchObject({ refreshToken: 'refresh-2' });
  });

  it('renueva antes de que caduque, con un margen', async () => {
    now = T0 + 900_000 - 10_000;

    await client().request('/datos', { schema: okSchema });

    expect(api.refreshCalls).toBe(1);
  });

  it('si el servidor rechaza un token aún vigente, renueva una vez y reintenta', async () => {
    api.validAccess = new Set();

    const result = await client().request('/datos', { schema: okSchema });

    expect(result.token).toBe('access-2');
    expect(api.refreshCalls).toBe(1);
  });

  it('peticiones simultáneas con el token caducado renuevan una sola vez (si no, el servidor revocaría la sesión)', async () => {
    now = T0 + 900_000;
    const c = client();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => c.request('/datos', { schema: okSchema })),
    );

    expect(results.every((r) => r.token === 'access-2')).toBe(true);
    expect(api.refreshCalls).toBe(1);
    expect(api.revoked).toBe(false);
  });

  it('peticiones simultáneas rechazadas con 401 tampoco renuevan dos veces', async () => {
    api.validAccess = new Set();
    const c = client();

    await Promise.all(Array.from({ length: 3 }, () => c.request('/datos', { schema: okSchema })));

    expect(api.refreshCalls).toBe(1);
    expect(api.revoked).toBe(false);
  });

  it('si no se puede renovar, borra los tokens y avisa de que la sesión terminó', async () => {
    api.revoked = true;
    now = T0 + 900_000;

    await expect(client().request('/datos', { schema: okSchema })).rejects.toMatchObject({
      status: 401,
    });
    expect(await tokens.load()).toBeNull();
    expect(ended).toBe(1);
  });

  it('sin sesión, una petición autenticada falla sin llamar al API', async () => {
    await tokens.clear();

    await expect(client().request('/datos')).rejects.toBeInstanceOf(ApiError);
    expect(api.refreshCalls).toBe(0);
  });

  it('convierte los errores del API en ApiError con su código', async () => {
    const error = await client()
      .request('/prohibido')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden', message: 'No.' });
  });

  it('envía un FormData tal cual, sin forzar JSON, y con el token', async () => {
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
    form.append('title', 'Acta');

    await c.request('/subida', { method: 'POST', body: form });

    expect(seen).toEqual({ contentType: null, body: form, auth: 'Bearer access-1' });
  });

  it('una respuesta 204 no se valida', async () => {
    await expect(client().request('/vacio', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('sin red, falla con NetworkError y conserva la sesión', async () => {
    const offline = createApiClient({
      baseUrl: BASE,
      tokens,
      fetch: (async () => {
        throw new TypeError('Network request failed');
      }) as typeof fetch,
      now: () => T0 + 900_000,
    });

    await expect(offline.request('/datos')).rejects.toBeInstanceOf(NetworkError);
    expect(await tokens.load()).not.toBeNull();
  });
});
