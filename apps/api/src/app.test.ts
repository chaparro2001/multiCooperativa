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
