import type { ApiError, HealthResponse } from '@multicooperativa/contracts';
import express, { type ErrorRequestHandler, type Express, type Router } from 'express';

/** Last resort: never leaks internals to the client (RNF-ACC-08 keeps tokens out of logs too). */
// Express tells error handlers apart by their four parameters, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const unhandledErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  // Malformed JSON body, rejected by express.json() before reaching any route.
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_request' } satisfies ApiError);
    return;
  }
  console.error(error instanceof Error ? error.stack : error);
  res.status(500).json({ error: 'internal_error' } satisfies ApiError);
};

export function createApp(routers: Router[] = []): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok' };
    res.json(body);
  });

  for (const router of routers) app.use(router);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' } satisfies ApiError);
  });
  app.use(unhandledErrors);

  return app;
}
