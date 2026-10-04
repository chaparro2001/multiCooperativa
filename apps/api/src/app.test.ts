import { healthResponseSchema } from '@multicooperativa/contracts';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app';

describe('GET /health', () => {
  it('responde 200 con el contrato de salud', async () => {
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
