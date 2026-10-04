import { type RequestHandler, Router } from 'express';

import type { EventPublisher } from '../../shared/events';
import type { FileStorage } from '../../shared/files/file-storage';
import type { PrismaClient } from '../../shared/infrastructure/prisma';
import type { InvoicingEvent } from './application/events';
import { createInvoicingDocumentsRouter } from './infrastructure/http/documents-router';
import { invoicingErrorHandler } from './infrastructure/http/error-handler';
import { createThirdPartiesRouter } from './infrastructure/http/third-parties-router';
import {
  PrismaDeliveryNoteStore,
  PrismaInvoiceStore,
  PrismaInvoicingSettingsStore,
} from './infrastructure/prisma-document-stores';
import { PrismaThirdPartyStore } from './infrastructure/prisma-third-party-store';

export type {
  DeliveryNoteRegistered,
  DiscrepancyDetected,
  InvoiceDueSoon,
  InvoiceOverdue,
  InvoiceRegistered,
  InvoicingEvent,
} from './application/events';

/** Calendar day in Spain, where the cooperatives are (AAAA-MM-DD). */
export function todayInSpain(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
}

/** Public interface of the invoicing module (requisitos/05). */
export function createInvoicingModule(deps: {
  prisma: PrismaClient;
  files: FileStorage;
  events: EventPublisher<InvoicingEvent>;
  requireCooperative: RequestHandler;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const thirdParties = new PrismaThirdPartyStore(deps.prisma);
  const deliveryNotes = new PrismaDeliveryNoteStore(deps.prisma);
  const useCaseDeps = {
    thirdParties,
    deliveryNotes,
    staleNotes: deliveryNotes,
    invoices: new PrismaInvoiceStore(deps.prisma),
    settings: new PrismaInvoicingSettingsStore(deps.prisma),
    files: deps.files,
    events: deps.events,
    now,
    today: () => todayInSpain(now()),
  };

  const router = Router();
  router.use(createThirdPartiesRouter({ thirdParties }, deps.requireCooperative));
  router.use(createInvoicingDocumentsRouter(useCaseDeps, deps.requireCooperative));

  return { router, errorHandler: invoicingErrorHandler };
}
