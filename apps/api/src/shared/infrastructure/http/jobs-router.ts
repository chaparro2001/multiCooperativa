import { createHash, timingSafeEqual } from 'node:crypto';

import type { ApiError } from '@multicooperativa/contracts';
import { Router, type RequestHandler } from 'express';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Constant-time comparison: hashing first makes both buffers the same length. */
export function tokensMatch(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

/**
 * Endpoints for an external scheduler (GitHub Actions cron), because a free host sleeps and
 * the in-process timer does not run while it does. Protected by a shared bearer secret; the
 * jobs themselves are idempotent.
 */
export function createJobsRouter(options: {
  token: string;
  dueDates: () => Promise<{ overdue: number; dueSoon: number }>;
  /** Housekeeping of expired sessions and old failed logins; the route exists only when given. */
  purgeAuthRecords?: () => Promise<{ sessions: number; failedAttempts: number }>;
}): Router {
  const router = Router();

  const job =
    (run: () => Promise<unknown>): RequestHandler =>
    async (req, res, next) => {
      const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
      if (!match?.[1] || !tokensMatch(match[1], options.token)) {
        res
          .status(401)
          .setHeader('WWW-Authenticate', 'Bearer')
          .json({ error: 'unauthenticated' } satisfies ApiError);
        return;
      }
      try {
        res.json(await run());
      } catch (error) {
        next(error);
      }
    };

  router.post('/jobs/due-dates', job(options.dueDates));
  const purge = options.purgeAuthRecords;
  if (purge) router.post('/jobs/purge-auth-records', job(purge));

  return router;
}
