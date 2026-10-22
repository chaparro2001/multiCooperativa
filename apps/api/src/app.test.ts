import { healthResponseSchema } from '@multicooperativa/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createApp } from './app';

describe('GET /health', () => {
  it('responds 200 with the health contract', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({ status: 'ok' });
  });
});

describe('ruta inexistente', () => {
  it('responde 404 en JSON', async () => {
    const response = await request(createApp()).get('/no-existe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });
});

describe('GET /ready', () => {
  it('answers 200 when the dependency probe succeeds', async () => {
    const response = await request(createApp({ readiness: async () => 1 })).get('/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('answers 503 when the probe fails, while /health stays up', async () => {
    const app = createApp({
      readiness: async () => {
        throw new Error('db down');
      },
    });

    const ready = await request(app).get('/ready');

    expect(ready.status).toBe(503);
    expect(ready.body).toEqual({ status: 'unavailable' });
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('answers 503 when the probe hangs past the timeout', async () => {
    const app = createApp({ readiness: () => new Promise(() => {}) });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
  }, 5000);
});

describe('X-Request-Id', () => {
  it('echoes a sane incoming id', async () => {
    const response = await request(createApp()).get('/health').set('X-Request-Id', 'abc-12345');

    expect(response.headers['x-request-id']).toBe('abc-12345');
  });

  it('generates one when the incoming id is missing or unsafe', async () => {
    const missing = await request(createApp()).get('/health');
    const unsafe = await request(createApp()).get('/health').set('X-Request-Id', 'a b<script>');

    expect(missing.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(unsafe.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('hardening', () => {
  it('sets the security headers on every response', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it('answers 413 payload_too_large to a JSON body over 100 kb', async () => {
    const app = createApp({
      routers: [(req, res, next) => (req.method === 'POST' ? res.json(req.body) : next())],
    });

    const response = await request(app)
      .post('/anything')
      .send({ text: 'x'.repeat(101 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'payload_too_large' });
  });

  it('answers 400 invalid_request to a ZodError that escaped a route', async () => {
    const app = createApp({
      routers: [
        (req, _res, next) => {
          if (req.path === '/boom') z.number().parse('abc');
          next();
        },
      ],
    });

    const response = await request(app).get('/boom');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_request' });
  });
});
