import type { ApiError } from '@multicooperativa/contracts';
import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';

import { AssemblyApplicationError } from '../../application/errors';
import {
  AlreadyVotedError,
  AssemblyDomainError,
  InsufficientNoticeError,
  InvalidAssemblyError,
} from '../../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  invalid_assembly: 400,
  insufficient_notice: 400,
  not_in_census: 403,
  not_found: 404,
  invalid_assembly_transition: 409,
  invalid_voting_transition: 409,
  voting_not_open: 409,
  already_voted: 409,
};

function details(error: AssemblyDomainError): ApiError['details'] {
  if (error instanceof InsufficientNoticeError) return { minNoticeDays: error.minNoticeDays };
  // HU-ASA-05: the member is shown the vote that counts.
  if (error instanceof AlreadyVotedError) return { choice: error.choice };
  return undefined;
}

export const assemblyErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
    error = new InvalidAssemblyError('Cada documento puede ocupar como máximo 10 MB.');
  }
  const ownError =
    error instanceof AssemblyDomainError || error instanceof AssemblyApplicationError;
  const status = ownError ? STATUS_BY_CODE[error.code] : undefined;
  if (!ownError || status === undefined) {
    next(error);
    return;
  }
  res.status(status).json({
    error: error.code,
    message: error.message,
    details: error instanceof AssemblyDomainError ? details(error) : undefined,
  } satisfies ApiError);
};
