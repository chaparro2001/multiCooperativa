import type { ApiError, HealthResponse } from '@multicooperativa/contracts';
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
  type Router,
} from 'express';

import { InvalidRequestError } from './shared/infrastructure/http/validation';

/** Last resort: never leaks internals to the client (RNF-ACC-08 keeps tokens out of logs too). */
// Express tells error handlers apart by their four parameters, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const unhandledErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  // A body that breaks its contract, or malformed JSON rejected by express.json().
  if (error instanceof InvalidRequestError || error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_request' } satisfies ApiError);
    return;
  }
  console.error(error instanceof Error ? error.stack : error);
  res.status(500).json({ error: 'internal_error' } satisfies ApiError);
};

export interface AppOptions {
  routers?: (Router | RequestHandler)[];
  /** Module error handlers that turn their errors into HTTP responses. */
  errorHandlers?: ErrorRequestHandler[];
  /** Number of proxies in front of the API, so `req.ip` is the client's (rate limits). */
  trustProxy?: number | false;
}

export function createApp({
  routers = [],
  errorHandlers = [],
  trustProxy = false,
}: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(express.json());

  app.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok' };
    res.json(body);
  });

  for (const router of routers) app.use(router);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' } satisfies ApiError);
  });
  for (const handler of errorHandlers) app.use(handler);
  app.use(unhandledErrors);

  return app;
}
