import type { ApiError } from '@multicooperativa/contracts';
import type { ErrorRequestHandler } from 'express';

import { AssistantApplicationError, UsageLimitExceededError } from '../../application/errors';

const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  assistant_refused: 422,
  usage_limit_exceeded: 429,
  assistant_unavailable: 503,
  assistant_model_not_available: 422,
  local_model_not_in_use: 409,
};

export const assistantErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  const status =
    error instanceof AssistantApplicationError ? STATUS_BY_CODE[error.code] : undefined;
  if (!(error instanceof AssistantApplicationError) || status === undefined) {
    next(error);
    return;
  }
  if (error instanceof UsageLimitExceededError) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }
  res.status(status).json({
    error: error.code,
    message: error.message,
    details:
      error instanceof UsageLimitExceededError
        ? { limit: error.limit, retryAfterSeconds: error.retryAfterSeconds }
        : undefined,
  } satisfies ApiError);
};
