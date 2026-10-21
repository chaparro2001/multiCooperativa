import { type RequestHandler, Router } from 'express';

import type { EventPublisher } from '../../shared/events';
import type { FileStorage } from '../../shared/files/file-storage';
import type { PrismaClient } from '../../shared/infrastructure/prisma';
import { createInvoicingReads } from './application/assistant-reads';
import { runDueDates } from './application/due-dates';
import type { DiscrepancyExplainer } from './application/ports/discrepancy-explainer';
import type { DocumentExtractor } from './application/ports/document-extractor';
import type { InvoicingEvent } from './application/events';
import { createExtractionsRouter } from './infrastructure/http/extractions-router';
import { createInvoicingDocumentsRouter } from './infrastructure/http/documents-router';
import { invoicingErrorHandler } from './infrastructure/http/error-handler';
import { createThirdPartiesRouter } from './infrastructure/http/third-parties-router';
import {
  PrismaDeliveryNoteStore,
  PrismaInvoiceStore,
  PrismaInvoicingSettingsStore,
} from './infrastructure/prisma-document-stores';
import {
  UnavailableDiscrepancyExplainer,
  UnavailableDocumentExtractor,
} from './infrastructure/gemini-ai';
import { PrismaDueDatesStore } from './infrastructure/prisma-due-dates-store';
import { PrismaThirdPartyStore } from './infrastructure/prisma-third-party-store';

export type { DiscrepancyExplainer } from './application/ports/discrepancy-explainer';
export type { DocumentExtractor, RawExtraction } from './application/ports/document-extractor';
export {
  GeminiDiscrepancyExplainer,
  GeminiDocumentExtractor,
  createGeminiClient,
} from './infrastructure/gemini-ai';
export { FakeDocumentExtractor } from './infrastructure/fake-document-extractor';
export type { InvoicingReads, ThirdPartyLine } from './application/assistant-reads';
export type {
  DeliveryNoteRegistered,
  DiscrepancyDetected,
  InvoiceDueSoon,
  InvoiceOverdue,
  InvoiceRegistered,
  InvoicingEvent,
} from './application/events';

/** Calendar day in Spain, where the cooperatives are (YYYY-MM-DD). */
export function todayInSpain(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
}

/** US-INV-07: the daily due-date process over every cooperative. Idempotent (NFR-INV-04). */
export function runDueDatesJob(deps: {
  prisma: PrismaClient;
  events: EventPublisher<InvoicingEvent>;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  return runDueDates(
    { dueDates: new PrismaDueDatesStore(deps.prisma), events: deps.events, now },
    todayInSpain(now()),
  );
}

/** Public interface of the invoicing module (requirements/05). */
export function createInvoicingModule(deps: {
  prisma: PrismaClient;
  files: FileStorage;
  events: EventPublisher<InvoicingEvent>;
  requireCooperative: RequestHandler;
  /** Reads photos and PDFs (ADR-009); the unavailable one answers 503. */
  extractor?: DocumentExtractor;
  /** Drafts the plain-language explanation of discrepancies (ADR-009); optional. */
  explainer?: DiscrepancyExplainer;
  /** From the access module: the cooperative's own tax id, to tell sales from purchases. */
  cooperativeTaxId(cooperativeId: string): Promise<string | null>;
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
    explainer: deps.explainer ?? new UnavailableDiscrepancyExplainer(),
  };

  const router = Router();
  router.use(createThirdPartiesRouter({ thirdParties }, deps.requireCooperative));
  router.use(createInvoicingDocumentsRouter(useCaseDeps, deps.requireCooperative));

  router.use(
    createExtractionsRouter(
      {
        extractor: deps.extractor ?? new UnavailableDocumentExtractor(),
        thirdParties,
        cooperativeTaxId: deps.cooperativeTaxId,
      },
      deps.requireCooperative,
    ),
  );

  return {
    router,
    errorHandler: invoicingErrorHandler,
    /** For the AI assistant's tools (requirements/07): same use cases and permissions. */
    reads: createInvoicingReads(useCaseDeps),
  };
}
