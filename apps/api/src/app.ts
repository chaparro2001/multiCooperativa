import type { HealthResponse } from '@multicooperativa/contracts';
import express, { type Express } from 'express';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok' };
    res.json(body);
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
