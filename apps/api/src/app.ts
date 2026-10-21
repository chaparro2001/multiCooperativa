import type { ApiError, HealthResponse } from '@multicooperativa/contracts';
import express, {
  type ErrorRequestHandler,
  type Express,
  type RequestHandler,
  type Router,
} from 'express';

import { MulterError } from 'multer';

import { corsMiddleware } from './shared/infrastructure/http/cors';
import { InvalidRequestError } from './shared/infrastructure/http/validation';

/** Last resort: never leaks internals to the client (NFR-ACC-08 keeps tokens out of logs too). */
// Express tells error handlers apart by their four parameters, so `_next` must stay.
const unhandledErrors: ErrorRequestHandler = (error, _req, res, _next) => {
  // A body that breaks its contract, malformed JSON rejected by express.json(), or a
  // multipart form multer refuses (extra fields or files). File size is each module's.
  if (
    error instanceof InvalidRequestError ||
    error?.type === 'entity.parse.failed' ||
    error instanceof MulterError
  ) {
    const issues = error instanceof InvalidRequestError ? error.issues : [];
    res
      .status(400)
      .json(
        (issues.length > 0
          ? { error: 'invalid_request', details: { issues } }
          : { error: 'invalid_request' }) satisfies ApiError,
      );
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
  /** Origins allowed to call the API from a browser (the hosted web build); none by default. */
  corsOrigins?: readonly string[];
}

export function createApp({
  routers = [],
  errorHandlers = [],
  trustProxy = false,
  corsOrigins = [],
}: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.use(corsMiddleware(corsOrigins));
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
