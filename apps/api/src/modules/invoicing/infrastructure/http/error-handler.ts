import type { ApiError } from '@multicooperativa/contracts';
import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';

import { InvoicingApplicationError, ThirdPartyExistsError } from '../../application/errors';
import {
  InvalidDocumentError,
  InvoicingDomainError,
  TotalMismatchError,
} from '../../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  invalid_amount: 400,
  invalid_third_party: 400,
  invalid_document: 400,
  total_mismatch: 400,
  not_found: 404,
  third_party_exists: 409,
  duplicate_number: 409,
  invalid_invoice_transition: 409,
};

function details(error: Error): ApiError['details'] {
  // HU-FAC-01: the app offers the existing party.
  if (error instanceof ThirdPartyExistsError) {
    return { thirdPartyId: error.thirdPartyId, name: error.partyName };
  }
  // HU-FAC-03: tells the difference.
  if (error instanceof TotalMismatchError)
    return { expected: error.expected, difference: error.difference };
  return undefined;
}

export const invoicingErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
    error = new InvalidDocumentError('El fichero puede ocupar como máximo 10 MB.');
  }
  const ownError =
    error instanceof InvoicingDomainError || error instanceof InvoicingApplicationError;
  const status = ownError ? STATUS_BY_CODE[error.code] : undefined;
  if (!ownError || status === undefined) {
    next(error);
    return;
  }
  res.status(status).json({
    error: error.code,
    message: error.message,
    details: details(error),
  } satisfies ApiError);
};
