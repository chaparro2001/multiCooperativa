import { GoogleGenAI } from '@google/genai';
import type { RequestHandler } from 'express';

import type { PrismaClient } from '../../shared/infrastructure/prisma';
import { type AssistantDeps, type RequestMetrics } from './application/assistant';
import type { DataSources } from './application/tool-executors';
import { createToolExecutors } from './application/tool-executors';
import type { LanguageModel } from './application/ports/language-model';
import { MESSAGE_LIMIT_PER_HOUR } from './domain/usage';
import { DEFAULT_GEMINI_MODEL, GeminiLanguageModel } from './infrastructure/gemini-language-model';
import { assistantErrorHandler } from './infrastructure/http/error-handler';
import { createAssistantRouter } from './infrastructure/http/assistant-router';
import { PrismaConversationStore } from './infrastructure/prisma-conversation-store';

export type { LanguageModel } from './application/ports/language-model';
export { DEFAULT_GEMINI_MODEL } from './infrastructure/gemini-language-model';
export { MESSAGE_LIMIT_PER_HOUR } from './domain/usage';

/** The Gemini adapter (ADR-009). The key never leaves the backend (NFR-AI-03). */
export function createGeminiLanguageModel(settings: {
  apiKey: string;
  model?: string;
}): LanguageModel {
  return new GeminiLanguageModel(
    new GoogleGenAI({ apiKey: settings.apiKey, httpOptions: { timeout: 60_000 } }),
    settings.model ?? DEFAULT_GEMINI_MODEL,
  );
}

/** NFR-AI-04: one line per request, with no personal content. */
const logMetrics = (metrics: RequestMetrics) =>
  console.info(JSON.stringify({ event: 'assistant_request', ...metrics }));

/** Calendar day in Spain, where the cooperatives are (YYYY-MM-DD). */
const todayInSpain = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);

/** Public interface of the assistant module (requirements/07). */
export function createAssistantModule(deps: {
  prisma: PrismaClient;
  /** Null when there is no API key: the assistant answers 503 and the rest of the app works (ADR-007). */
  model: LanguageModel | null;
  /** The other modules, through their public interfaces (BR-AI-02). */
  sources: DataSources;
  requireCooperative: RequestHandler;
  messageLimitPerHour?: number;
  onMetrics?: (metrics: RequestMetrics) => void;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const useCaseDeps: AssistantDeps = {
    conversations: new PrismaConversationStore(deps.prisma),
    model: deps.model,
    executors: createToolExecutors(deps.sources),
    now,
    today: () => todayInSpain(now()),
    messageLimitPerHour: deps.messageLimitPerHour ?? MESSAGE_LIMIT_PER_HOUR,
    onMetrics: deps.onMetrics ?? logMetrics,
  };
  return {
    router: createAssistantRouter(useCaseDeps, deps.requireCooperative),
    errorHandler: assistantErrorHandler,
  };
}

export type { DataSources } from './application/tool-executors';
export type { RequestMetrics } from './application/assistant';
