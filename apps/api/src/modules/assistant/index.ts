import { GoogleGenAI } from '@google/genai';
import type { RequestHandler } from 'express';

import type { PrismaClient } from '../../shared/infrastructure/prisma';
import { type AssistantDeps, type RequestMetrics } from './application/assistant';
import type { DataSources } from './application/tool-executors';
import { createToolExecutors } from './application/tool-executors';
import type { LanguageModel } from './application/ports/language-model';
import type { AuditRecorder, LocalModelRuntime } from './application/ports/local-models';
import { OllamaModelRuntime } from './infrastructure/ollama-model-runtime';
import type { HostedProviderGateway } from './application/ports/hosted-provider';
import { AesGcmSecretCipher } from './infrastructure/aes-gcm-secret-cipher';
import { OpenAICompatibleGateway } from './infrastructure/openai-compatible-gateway';
import { OpenAICompatibleLanguageModel } from './infrastructure/openai-compatible-language-model';
import { findHostedProvider } from './domain/hosted-provider';
import { PrismaAssistantSettingStore } from './infrastructure/prisma-setting-store';
import { MESSAGE_LIMIT_PER_HOUR } from './domain/usage';
import { DEFAULT_GEMINI_MODEL, GeminiLanguageModel } from './infrastructure/gemini-language-model';
import {
  DEFAULT_OLLAMA_CHAT_MODEL,
  OllamaLanguageModel,
} from './infrastructure/ollama-language-model';
import { assistantErrorHandler } from './infrastructure/http/error-handler';
import { createAssistantRouter } from './infrastructure/http/assistant-router';
import { PrismaConversationStore } from './infrastructure/prisma-conversation-store';

export type { LanguageModel } from './application/ports/language-model';
export type { LocalModelRuntime } from './application/ports/local-models';
export type { HostedProviderGateway, HostedSetting } from './application/ports/hosted-provider';

/** The local models Ollama can serve for the assistant, chosen per cooperative (ADR-014). */
export function createOllamaModelRuntime(settings: {
  url: string;
  defaultModel: string;
  models: readonly string[];
  timeoutMs?: number;
}): LocalModelRuntime {
  return new OllamaModelRuntime(settings);
}
export { DEFAULT_GEMINI_MODEL } from './infrastructure/gemini-language-model';
export { DEFAULT_OLLAMA_CHAT_MODEL } from './infrastructure/ollama-language-model';
export { MESSAGE_LIMIT_PER_HOUR } from './domain/usage';

/** The Gemini adapter (ADR-009). The key never leaves the backend (NFR-AI-03). */
export function createGeminiLanguageModel(settings: {
  apiKey: string;
  model?: string;
  /** Tried in order when the model keeps answering overloaded (GEMINI_FALLBACK_MODELS). */
  fallbackModels?: readonly string[];
}): LanguageModel {
  return new GeminiLanguageModel(
    new GoogleGenAI({ apiKey: settings.apiKey, httpOptions: { timeout: 60_000 } }),
    settings.model ?? DEFAULT_GEMINI_MODEL,
    settings.fallbackModels,
  );
}

/** A hosted OpenAI-compatible provider from the fixed catalog, with its own key (ADR-019). Null for an unknown provider. */
export function createHostedLanguageModel(settings: {
  provider: string;
  model: string;
  apiKey: string;
}): LanguageModel | null {
  const provider = findHostedProvider(settings.provider);
  return provider
    ? new OpenAICompatibleLanguageModel({
        baseUrl: provider.baseUrl,
        model: settings.model,
        apiKey: settings.apiKey,
      })
    : null;
}

/** A local model served by Ollama (ADR-013): no key, no quota, nothing leaves the host. */
export function createOllamaLanguageModel(settings: {
  url: string;
  model?: string;
  timeoutMs?: number;
}): LanguageModel {
  return new OllamaLanguageModel({
    url: settings.url,
    model: settings.model ?? DEFAULT_OLLAMA_CHAT_MODEL,
    timeoutMs: settings.timeoutMs,
  });
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
  /** Null when the provider is not configured (no Gemini key): the assistant answers 503 and the rest of the app works (ADR-009). */
  model: LanguageModel | null;
  /** With the Ollama provider: the models each cooperative may choose from (US-AI-07); `model` is then ignored. */
  local?: LocalModelRuntime;
  /** ASSISTANT_SECRETS_KEY (32 bytes, base64): encrypts the API keys of cooperatives on a hosted provider (ADR-019). Without it hosted mode is unavailable. */
  secretsKey?: string;
  /** Talks to the hosted providers; tests pass a fake. */
  hostedGateway?: HostedProviderGateway;
  /** Writes to the cooperative's audit log, through the access module. */
  audit: AuditRecorder;
  /** The other modules, through their public interfaces (BR-AI-02). */
  sources: DataSources;
  requireCooperative: RequestHandler;
  messageLimitPerHour?: number;
  onMetrics?: (metrics: RequestMetrics) => void;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  const settingsStore = new PrismaAssistantSettingStore(deps.prisma);
  const settingsDeps = {
    local: deps.local ?? null,
    settings: settingsStore,
    audit: deps.audit,
    hosted: {
      store: settingsStore,
      gateway: deps.hostedGateway ?? new OpenAICompatibleGateway(),
      cipher: deps.secretsKey ? new AesGcmSecretCipher(deps.secretsKey) : null,
    },
  };
  const useCaseDeps: AssistantDeps = {
    conversations: new PrismaConversationStore(deps.prisma),
    model: deps.model,
    localModels: settingsDeps,
    executors: createToolExecutors(deps.sources),
    now,
    today: () => todayInSpain(now()),
    messageLimitPerHour: deps.messageLimitPerHour ?? MESSAGE_LIMIT_PER_HOUR,
    onMetrics: deps.onMetrics ?? logMetrics,
  };
  return {
    router: createAssistantRouter(useCaseDeps, settingsDeps, deps.requireCooperative),
    errorHandler: assistantErrorHandler,
  };
}

export type { DataSources } from './application/tool-executors';
export type { RequestMetrics } from './application/assistant';

/** Evaluation set of NFR-AI-05, runnable against any model (`ai:eval` for the real one). */
export { EVALUATION_CASES } from './evaluation/cases';
export { RuleBasedLanguageModel } from './evaluation/rule-based-model';
export { runEvaluation } from './evaluation/run-evaluation';
