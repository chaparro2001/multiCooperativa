import type { RequestHandler } from 'express';

import type { FileStorage } from '../../shared/files/file-storage';
import type { PrismaClient } from '../../shared/infrastructure/prisma';
import type { AuditRecorder } from './application/ports/branding-store';
import { createBrandingRouter } from './infrastructure/http/branding-router';
import { brandingErrorHandler } from './infrastructure/http/error-handler';
import { PrismaBrandingStore } from './infrastructure/prisma-branding-store';

/** Per-cooperative look: primary colour and logo, set by its administrator (ADR-018, US-ACC-14). */
export function createBrandingModule(deps: {
  prisma: PrismaClient;
  files: FileStorage;
  /** Writes to the cooperative's audit log, through the access module. */
  audit: AuditRecorder;
  requireCooperative: RequestHandler;
  now?: () => Date;
}) {
  const useCaseDeps = {
    store: new PrismaBrandingStore(deps.prisma),
    files: deps.files,
    audit: deps.audit,
    now: deps.now ?? (() => new Date()),
  };
  return {
    router: createBrandingRouter(useCaseDeps, deps.requireCooperative),
    errorHandler: brandingErrorHandler,
  };
}
