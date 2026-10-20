import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../../app';

const ORIGIN = 'https://chaparro2001.github.io';
const app = createApp({ corsOrigins: [ORIGIN] });

describe('CORS (deny by default)', () => {
  it('allows the configured origin and exposes Retry-After', async () => {
    const response = await request(app).get('/health').set('Origin', ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(response.headers['access-control-expose-headers']).toBe('Retry-After');
    expect(response.headers.vary).toContain('Origin');
  });

  it('answers the preflight of the allowed origin with 204 and the allowed headers', async () => {
    const response = await request(app)
      .options('/auth/login')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(response.headers['access-control-allow-headers']).toMatch(/Authorization/);
    expect(response.headers['access-control-allow-methods']).toMatch(/POST/);
  });

  it('gives no CORS headers to another origin and refuses its preflight', async () => {
    const simple = await request(app).get('/health').set('Origin', 'https://evil.example');
    const preflight = await request(app)
      .options('/auth/login')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'POST');

    expect(simple.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.status).toBe(403);
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not treat a lookalike origin as allowed', async () => {
    const response = await request(app).get('/health').set('Origin', `${ORIGIN}.evil.example`);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows nothing when no origin is configured, and ignores requests without Origin', async () => {
    const closed = createApp();
    const browser = await request(closed).get('/health').set('Origin', ORIGIN);
    const native = await request(closed).get('/health');

    expect(browser.headers['access-control-allow-origin']).toBeUndefined();
    expect(native.status).toBe(200);
  });
});
