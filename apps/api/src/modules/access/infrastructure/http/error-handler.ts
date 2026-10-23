import type { ApiError } from '@multicooperativa/contracts';
import type { ErrorRequestHandler } from 'express';

import { AccessApplicationError, LoginLockedError } from '../../application/errors';
import { AccessDomainError } from '../../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  password_required: 400,
  weak_password: 400,
  profile_not_found: 400,
  invalid_credentials: 401,
  invalid_refresh_token: 401,
  unauthenticated: 401,
  no_active_membership: 403,
  forbidden: 403,
  not_found: 404,
  member_already_exists: 409,
  member_nif_taken: 409,
  invalid_member_nif: 400,
  invitation_not_pending: 409,
  self_modification: 409,
  last_admin: 409,
  invalid_membership_transition: 409,
  invitation_not_usable: 410,
  login_locked: 429,
  invitation_delivery_unavailable: 503,
};

/**
 * Turns access errors into responses. Installed at app level because the access
 * middleware also runs inside the routers of every other module.
 */
export const accessErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
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
  if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(status).json({ error: error.code, message: error.message } satisfies ApiError);
};
