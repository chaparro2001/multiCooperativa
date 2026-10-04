import { type RequestHandler, Router } from 'express';

import type { PrismaClient } from '../../shared/infrastructure/prisma';
import { invoicingErrorHandler } from './infrastructure/http/error-handler';
import { createThirdPartiesRouter } from './infrastructure/http/third-parties-router';
import { PrismaThirdPartyStore } from './infrastructure/prisma-third-party-store';

/** Public interface of the invoicing module (requisitos/05). */
export function createInvoicingModule(deps: {
  prisma: PrismaClient;
  requireCooperative: RequestHandler;
}) {
  const thirdParties = new PrismaThirdPartyStore(deps.prisma);

  const router = Router();
  router.use(createThirdPartiesRouter({ thirdParties }, deps.requireCooperative));

  return { router, errorHandler: invoicingErrorHandler };
}
