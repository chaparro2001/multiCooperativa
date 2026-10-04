import {
  type AcceptInvitationResponse,
  acceptInvitationRequestSchema,
  type ApiError,
  type AuthTokens,
  loginRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
} from '@multicooperativa/contracts';
import { type ErrorRequestHandler, type Response, Router } from 'express';
import type { z } from 'zod';

import type {
  AcceptInvitationInput,
  AcceptInvitationResult,
} from '../../application/accept-invitation';
import { AccessApplicationError, LoginLockedError } from '../../application/errors';
import type { LoginInput } from '../../application/login';
import type { AuthTokens as IssuedTokens } from '../../application/session-tokens';
import { AccessDomainError } from '../../domain/errors';

export interface AuthUseCases {
  login(input: LoginInput): Promise<IssuedTokens>;
  refreshSession(refreshToken: string): Promise<IssuedTokens>;
  logout(refreshToken: string): Promise<void>;
  acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult>;
}

class InvalidRequestError extends Error {}

function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new InvalidRequestError();
  return result.data;
}

const STATUS_BY_CODE: Record<string, number> = {
  invalid_credentials: 401,
  invalid_refresh_token: 401,
  no_active_membership: 403,
  invitation_not_usable: 410,
  login_locked: 429,
  password_required: 400,
  weak_password: 400,
};

const authErrors: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof InvalidRequestError) {
    res.status(400).json({ error: 'invalid_request' } satisfies ApiError);
    return;
  }
  const isAccessError =
    error instanceof AccessApplicationError || error instanceof AccessDomainError;
  const status = isAccessError ? STATUS_BY_CODE[error.code] : undefined;
  if (!isAccessError || status === undefined) {
    next(error);
    return;
  }
  if (error instanceof LoginLockedError) {
    const seconds = Math.max(1, Math.ceil((error.until.getTime() - Date.now()) / 1000));
    res.setHeader('Retry-After', String(seconds));
  }
  res.status(status).json({ error: error.code, message: error.message } satisfies ApiError);
};

function sendTokens(res: Response, tokens: IssuedTokens) {
  res.json(tokens satisfies AuthTokens);
}

/** HTTP adapter for the authentication endpoints, which run without a cooperative context. */
export function createAuthRouter(auth: AuthUseCases): Router {
  const router = Router();

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

  router.use('/auth', authErrors);
  return router;
}
