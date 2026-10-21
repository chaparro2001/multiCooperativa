import type { ApiError } from '@multicooperativa/contracts';
import type { ErrorRequestHandler } from 'express';

import { MembersApplicationError } from '../../application/errors';
import { InsufficientCapitalError, MembersDomainError } from '../../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  invalid_movement: 400,
  not_found: 404,
  insufficient_capital: 409,
};

function details(error: MembersDomainError): ApiError['details'] {
  // US-MEM-03: tells the capital the refund exceeds.
  if (error instanceof InsufficientCapitalError) return { available: error.available };
  return undefined;
}

export const membersErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  const ownError = error instanceof MembersDomainError || error instanceof MembersApplicationError;
  const status = ownError ? STATUS_BY_CODE[error.code] : undefined;
  if (!ownError || status === undefined) {
    next(error);
    return;
  }
  res.status(status).json({
    error: error.code,
    message: error.message,
    details: error instanceof MembersDomainError ? details(error) : undefined,
  } satisfies ApiError);
};
