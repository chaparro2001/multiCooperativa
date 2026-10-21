import type { LanguageModel } from './language-model';

/**
 * The local models the server can run (ADR-013, ADR-014). Present only with
 * ASSISTANT_LLM_PROVIDER=ollama. It never pulls a model: it only lists and uses.
 */
export interface LocalModelRuntime {
  /** Model used by cooperatives that have not chosen (ASSISTANT_OLLAMA_MODEL). */
  readonly defaultModel: string;
  /** Operator allowlist (ASSISTANT_OLLAMA_MODELS), always containing the default. */
  readonly allowed: readonly string[];
  /** Models installed in Ollama, or null when it cannot be reached. May be cached briefly. */
  installed(): Promise<readonly string[] | null>;
  /** The chat model for one of the allowed ids. */
  create(model: string): LanguageModel;
}

/** What each cooperative saved: absent means the server default. Always scoped to a cooperative. */
export interface AssistantSettingStore {
  getModel(cooperativeId: string): Promise<string | null>;
  /** `null` removes the choice. */
  setModel(cooperativeId: string, model: string | null): Promise<void>;
}

/** Leaves a trace in the cooperative's audit log; provided by the access module. */
export type AuditRecorder = (
  cooperativeId: string,
  event: { actorUserId: string; action: string; detail: Record<string, unknown> },
) => Promise<void>;
