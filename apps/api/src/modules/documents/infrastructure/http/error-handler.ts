import type { ApiError } from '@multicooperativa/contracts';
import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';

import { DocumentApplicationError } from '../../application/errors';
import { EmbeddingUnavailableError } from '../../application/ports/embedder';
import { DocumentDomainError, DocumentFileRejectedError } from '../../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  invalid_document: 400,
  file_rejected: 400,
  not_found: 404,
  invalid_document_transition: 409,
};

export const documentErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  // Multer stops reading at 20 MB, before the file reaches the use case (BR-DOC-02).
  if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
    error = new DocumentFileRejectedError('too_large');
  }
  if (error instanceof EmbeddingUnavailableError) {
    // Search depends on the embeddings service (ADR-006); everything else keeps working.
    console.error(error.message);
    res.status(503).json({
      error: 'search_unavailable',
      message: 'Content search is not available at the moment.',
    } satisfies ApiError);
    return;
  }
  const ownError =
    error instanceof DocumentDomainError || error instanceof DocumentApplicationError;
  const status = ownError ? STATUS_BY_CODE[error.code] : undefined;
  if (!ownError || status === undefined) {
    next(error);
    return;
  }
  res.status(status).json({
    error: error.code,
    message: error.message,
    details:
      error instanceof DocumentFileRejectedError
        ? { reason: error.reason }
        : error instanceof DocumentDomainError && error.field
          ? { field: error.field }
          : undefined,
  } satisfies ApiError);
};
