import type { ApiError } from '@multicooperativa/contracts';
import type { ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';

import { AnnouncementApplicationError } from '../../application/errors';
import {
  AnnouncementDomainError,
  AttachmentRejectedError,
  InvalidAnnouncementError,
} from '../../domain/errors';

const STATUS_BY_CODE: Record<string, number> = {
  invalid_announcement: 400,
  attachment_rejected: 400,
  not_found: 404,
  invalid_announcement_transition: 409,
};

function details(error: AnnouncementDomainError): ApiError['details'] {
  if (error instanceof InvalidAnnouncementError) return { issues: error.issues };
  if (error instanceof AttachmentRejectedError) return { reason: error.reason };
  return undefined;
}

export const announcementErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  // Multer stops reading at the limit, before the file reaches the use case.
  if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
    error = new AttachmentRejectedError('too_large');
  }
  const ownError =
    error instanceof AnnouncementDomainError || error instanceof AnnouncementApplicationError;
  const status = ownError ? STATUS_BY_CODE[error.code] : undefined;
  if (!ownError || status === undefined) {
    next(error);
    return;
  }
  res.status(status).json({
    error: error.code,
    message: error.message,
    details: error instanceof AnnouncementDomainError ? details(error) : undefined,
  } satisfies ApiError);
};
