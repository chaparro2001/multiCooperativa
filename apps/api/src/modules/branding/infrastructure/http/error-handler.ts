import type { ApiError } from '@multicooperativa/contracts';
import type { ErrorRequestHandler } from 'express';

import {
  BrandingApplicationError,
  InsufficientContrastError,
  LogoRejectedError,
} from '../../application/errors';

const STATUS_BY_CODE: Record<string, number> = {
  insufficient_contrast: 422,
  invalid_color: 422,
  logo_rejected: 422,
};

export const brandingErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  const status = error instanceof BrandingApplicationError ? STATUS_BY_CODE[error.code] : undefined;
  if (!(error instanceof BrandingApplicationError) || status === undefined) {
    next(error);
    return;
  }
  let details: Record<string, unknown> | undefined;
  if (error instanceof InsufficientContrastError) {
    details = { ratio: error.ratio, minimum: error.minimum };
  } else if (error instanceof LogoRejectedError) {
    details = { reason: error.reason };
  }
  res
    .status(status)
    .json({ error: error.code, message: error.message, details } satisfies ApiError);
};
