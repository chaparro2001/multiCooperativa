import type { Express } from 'express';

import { createApp } from './app';
import { type AuthRateLimits, createAccessModule, type InvitationSender } from './modules/access';
import { type AnnouncementEvent, createAnnouncementsModule } from './modules/announcements';
import { type AssemblyEvent, createAssembliesModule } from './modules/assemblies';
import {
  createAssistantModule,
  type HostedProviderGateway,
  type LanguageModel,
  type LocalModelRuntime,
} from './modules/assistant';
import { createBrandingModule } from './modules/branding';
import { createDocumentsModule, type DocumentEvent, type Embedder } from './modules/documents';
import {
  createInvoicingModule,
  type DiscrepancyExplainer,
  type DocumentExtractor,
  type InvoicingEvent,
  runDueDatesJob,
} from './modules/invoicing';
import { createMembersModule } from './modules/members';
import { type EventBus, InProcessEventBus } from './shared/events';
import { createJobsRouter } from './shared/infrastructure/http/jobs-router';
import type { FileStorage } from './shared/files/file-storage';
import type { PrismaClient } from './shared/infrastructure/prisma';

/** Every internal event of the app: the union grows with each module that emits. */
export type AppEvent = AnnouncementEvent | DocumentEvent | AssemblyEvent | InvoicingEvent;

export interface ApiDeps {
  prisma: PrismaClient;
  jwtSecret: string;
  invitationSender: InvitationSender;
  files: FileStorage;
  /** Embeddings for document indexing and search (ADR-006). */
  embedder: Embedder;
  /** Reads scanned invoices and delivery notes (ADR-009); without it, extraction answers 503. */
  documentExtractor?: DocumentExtractor;
  /** Drafts explanations of invoice discrepancies (ADR-009); without it they stay empty. */
  discrepancyExplainer?: DiscrepancyExplainer;
  /** Model of the AI assistant; without it the assistant answers 503 (ADR-009). */
  languageModel?: LanguageModel | null;
  /** Injectable so tests can observe the events; one in-process bus by default. */
  events?: EventBus<AppEvent>;
  /** BR-AI-08; 30 when omitted. */
  assistantMessageLimitPerHour?: number;
  /** Local models the assistant can use per cooperative (ASSISTANT_LLM_PROVIDER=ollama; ADR-014). */
  assistantLocalModels?: LocalModelRuntime;
  /** ASSISTANT_SECRETS_KEY: encrypts the API keys of cooperatives on a hosted provider (ADR-019). Without it hosted mode is unavailable. */
  assistantSecretsKey?: string;
  /** Hosted providers' gateway; tests pass a fake (ADR-019). */
  assistantHostedGateway?: HostedProviderGateway;
  authRateLimits?: AuthRateLimits | false;
  trustProxy?: number | false;
  /** Origins allowed to call the API from a browser (CORS); none when omitted. */
  corsOrigins?: readonly string[];
  /** Bearer secret of `POST /jobs/due-dates`, for an external scheduler; the endpoint is not mounted without it. */
  jobsToken?: string;
}

export interface Api {
  app: Express;
  /** Background document indexing: resumed at startup, awaited in tests. */
  indexing: { resumePending(): Promise<number>; idle(): Promise<void> };
  /** Daily due dates of invoices, on this API's event bus (US-INV-07). */
  runDueDates(): Promise<{ overdue: number; dueSoon: number }>;
}

/**
 * Wires every module into the HTTP app. The only composition root: `main.ts`
 * runs it and the isolation test walks all the routes it registers.
 */
export function createApi(deps: ApiDeps): Api {
  const events =
    deps.events ??
    new InProcessEventBus<AppEvent>({
      onHandlerError: (error, event) =>
        console.error(
          `Fallo al procesar ${event.type}:`,
          error instanceof Error ? error.stack : error,
        ),
    });

  const access = createAccessModule({
    prisma: deps.prisma,
    jwtSecret: deps.jwtSecret,
    invitationSender: deps.invitationSender,
    authRateLimits: deps.authRateLimits,
  });
  const announcements = createAnnouncementsModule({
    prisma: deps.prisma,
    files: deps.files,
    events,
    onAssemblyRescheduled: (handler) => events.subscribe('AssemblyRescheduled', handler),
    members: access.directory,
    requireCooperative: access.requireCooperative,
  });
  const documents = createDocumentsModule({
    prisma: deps.prisma,
    files: deps.files,
    events,
    members: access.directory,
    requireCooperative: access.requireCooperative,
    embedder: deps.embedder,
  });

  const assemblies = createAssembliesModule({
    prisma: deps.prisma,
    files: deps.files,
    events,
    members: access.directory,
    requireCooperative: access.requireCooperative,
  });

  const invoicing = createInvoicingModule({
    prisma: deps.prisma,
    files: deps.files,
    events,
    requireCooperative: access.requireCooperative,
    extractor: deps.documentExtractor,
    explainer: deps.discrepancyExplainer,
    cooperativeTaxId: (id) => access.directory.cooperativeTaxId(id),
    audit: access.recordAudit,
  });

  const members = createMembersModule({
    prisma: deps.prisma,
    members: access.directory,
    requireCooperative: access.requireCooperative,
  });

  const assistant = createAssistantModule({
    prisma: deps.prisma,
    model: deps.languageModel ?? null,
    local: deps.assistantLocalModels,
    secretsKey: deps.assistantSecretsKey,
    hostedGateway: deps.assistantHostedGateway,
    audit: access.recordAudit,
    requireCooperative: access.requireCooperative,
    messageLimitPerHour: deps.assistantMessageLimitPerHour,
    sources: {
      documents: documents,
      invoicing: invoicing.reads,
      assemblies: assemblies.reads,
      announcements: announcements.reads,
      memberArea: members.reads,
    },
  });

  const branding = createBrandingModule({
    prisma: deps.prisma,
    files: deps.files,
    audit: access.recordAudit,
    requireCooperative: access.requireCooperative,
  });

  const runDueDates = () => runDueDatesJob({ prisma: deps.prisma, events });

  const app = createApp({
    routers: [
      ...(deps.jobsToken
        ? [createJobsRouter({ token: deps.jobsToken, dueDates: runDueDates })]
        : []),
      access.router,
      announcements.router,
      documents.router,
      assemblies.router,
      invoicing.router,
      members.router,
      assistant.router,
      branding.router,
    ],
    errorHandlers: [
      access.errorHandler,
      announcements.errorHandler,
      documents.errorHandler,
      assemblies.errorHandler,
      invoicing.errorHandler,
      members.errorHandler,
      assistant.errorHandler,
      branding.errorHandler,
    ],
    trustProxy: deps.trustProxy,
    corsOrigins: deps.corsOrigins,
  });
  return {
    app,
    indexing: documents.indexing,
    runDueDates,
  };
}
