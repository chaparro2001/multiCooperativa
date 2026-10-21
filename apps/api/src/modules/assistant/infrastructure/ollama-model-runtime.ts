import type { LanguageModel } from '../application/ports/language-model';
import type { LocalModelRuntime } from '../application/ports/local-models';
import { OllamaLanguageModel } from './ollama-language-model';

/** Installed models change rarely; a short cache keeps the settings screen from hitting Ollama on every call. */
export const TAGS_CACHE_MS = 15_000;
const TAGS_TIMEOUT_MS = 3_000;

export interface OllamaModelRuntimeSettings {
  url: string;
  defaultModel: string;
  /** Operator allowlist; the default is added when missing. */
  models: readonly string[];
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * ADR-014: lists what Ollama has installed (`GET /api/tags`) and builds one chat model per id.
 * It never calls `/api/pull`: models are installed by the operator (`make ollama-pull`), not by the app.
 */
export class OllamaModelRuntime implements LocalModelRuntime {
  readonly defaultModel: string;
  readonly allowed: readonly string[];
  private readonly chatModels = new Map<string, LanguageModel>();
  private cache: { at: number; models: readonly string[] } | null = null;
  private readonly http: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly settings: OllamaModelRuntimeSettings) {
    this.defaultModel = settings.defaultModel;
    this.allowed = [...new Set([settings.defaultModel, ...settings.models])];
    this.http = settings.fetch ?? fetch;
    this.now = settings.now ?? Date.now;
  }

  async installed(): Promise<readonly string[] | null> {
    if (this.cache && this.now() - this.cache.at < TAGS_CACHE_MS) return this.cache.models;
    try {
      const response = await this.http(new URL('/api/tags', this.settings.url), {
        signal: AbortSignal.timeout(TAGS_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { models?: { name?: unknown }[] };
      const models = (body.models ?? []).flatMap((entry) =>
        typeof entry.name === 'string' ? [entry.name] : [],
      );
      this.cache = { at: this.now(), models };
      return models;
    } catch {
      return null;
    }
  }

  create(model: string): LanguageModel {
    let chat = this.chatModels.get(model);
    if (!chat) {
      chat = new OllamaLanguageModel({
        url: this.settings.url,
        model,
        timeoutMs: this.settings.timeoutMs,
      });
      this.chatModels.set(model, chat);
    }
    return chat;
  }
}
