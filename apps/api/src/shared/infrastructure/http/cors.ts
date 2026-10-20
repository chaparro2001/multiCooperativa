import type { RequestHandler } from 'express';

const MAX_AGE_SECONDS = 600;

/**
 * Deny-by-default CORS: only the listed origins get `Access-Control-*` headers. The native
 * apps do not send an `Origin`; this exists for the web build hosted on another origin.
 * A preflight from an unlisted origin is refused with 403.
 */
export function corsMiddleware(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.map((origin) => origin.replace(/\/+$/, '')));
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();

    const isAllowed = allowed.has(origin);
    res.vary('Origin');
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    }

    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      if (!isAllowed) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept');
      res.setHeader('Access-Control-Max-Age', String(MAX_AGE_SECONDS));
      res.status(204).end();
      return;
    }
    next();
  };
}
