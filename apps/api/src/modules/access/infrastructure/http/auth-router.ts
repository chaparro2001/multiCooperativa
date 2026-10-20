import {
  type AcceptInvitationResponse,
  acceptInvitationRequestSchema,
  type ApiError,
  type AuthTokens,
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
} from '@multicooperativa/contracts';
import { type Response, Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { parseBody } from '../../../../shared/infrastructure/http/validation';
import type {
  AcceptInvitationInput,
  AcceptInvitationResult,
} from '../../application/accept-invitation';
import type { LoginInput } from '../../application/login';
import type { AuthTokens as IssuedTokens } from '../../application/session-tokens';
import { normalizeEmail } from '../../domain/email';

export interface AuthUseCases {
  login(input: LoginInput): Promise<IssuedTokens>;
  refreshSession(refreshToken: string): Promise<IssuedTokens>;
  logout(refreshToken: string): Promise<void>;
  acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult>;
}

/** NFR-ACC-09. In memory: valid while the API runs as a single instance. */
export interface AuthRateLimits {
  windowMs: number;
  /** Requests per IP to any /auth endpoint. */
  perIp: number;
  /** Login requests per email, whatever the IP. */
  perEmail: number;
}

export const DEFAULT_AUTH_RATE_LIMITS: AuthRateLimits = {
  windowMs: 15 * 60 * 1000,
  // Generous: everyone in a cooperative office may share one public IP.
  perIp: 100,
  perEmail: 20,
};

function rateLimiters(limits: AuthRateLimits) {
  const common = {
    windowMs: limits.windowMs,
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
    handler: (_req: unknown, res: Response) => {
      res.status(429).json({ error: 'too_many_requests' } satisfies ApiError);
    },
  };
  return {
    perIp: rateLimit({ ...common, limit: limits.perIp }),
    perEmail: rateLimit({
      ...common,
      limit: limits.perEmail,
      identifier: 'email',
      // Without a usable email the request fails validation anyway; it still counts per IP.
      skip: (req) => typeof req.body?.email !== 'string',
      keyGenerator: (req) => normalizeEmail(req.body.email as string),
    }),
  };
}

function sendTokens(res: Response, tokens: IssuedTokens) {
  res.json(tokens satisfies AuthTokens);
}

/** HTTP adapter for the authentication endpoints, which run without a cooperative context. */
export function createAuthRouter(auth: AuthUseCases, limits: AuthRateLimits | false): Router {
  const router = Router();

  if (limits) {
    const limiter = rateLimiters(limits);
    router.use('/auth', limiter.perIp);
    router.use('/auth/login', limiter.perEmail);
  }

  router.post('/auth/login', async (req, res) => {
    sendTokens(res, await auth.login(parseBody(loginRequestSchema, req.body)));
  });

  router.post('/auth/refresh', async (req, res) => {
    const { refreshToken } = parseBody(refreshRequestSchema, req.body);
    sendTokens(res, await auth.refreshSession(refreshToken));
  });

  router.post('/auth/logout', async (req, res) => {
    const { refreshToken } = parseBody(logoutRequestSchema, req.body);
    await auth.logout(refreshToken);
    res.status(204).end();
  });

  router.post('/auth/invitations/accept', async (req, res) => {
    const result = await auth.acceptInvitation(parseBody(acceptInvitationRequestSchema, req.body));
    res.json(result satisfies AcceptInvitationResponse);
  });

  return router;
}
