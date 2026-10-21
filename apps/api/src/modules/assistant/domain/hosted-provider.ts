/**
 * Hosted OpenAI-compatible providers a cooperative can bring its own API key to (US-AI-07, ADR-019).
 * Pure rules: the fixed catalog, the format of what the administrator types and how a choice is
 * labelled. The catalog is closed on purpose: the API never calls a base URL typed by a client (SSRF).
 */

export type HostedProviderId = 'groq' | 'mistral' | 'nvidia' | 'openrouter';

export interface HostedProvider {
  id: HostedProviderId;
  /** OpenAI-compatible root: `{baseUrl}/chat/completions` and `{baseUrl}/models`. */
  baseUrl: string;
  /** Ids the app can suggest; any other id the provider lists is accepted. */
  suggestedModels: readonly string[];
}

export const HOSTED_PROVIDERS: readonly HostedProvider[] = [
  {
    id: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    suggestedModels: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'],
  },
  {
    id: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    suggestedModels: ['mistral-small-latest', 'mistral-medium-latest'],
  },
  {
    id: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    suggestedModels: ['meta/llama-3.3-70b-instruct', 'openai/gpt-oss-120b'],
  },
  {
    id: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    suggestedModels: ['openai/gpt-oss-20b:free', 'openai/gpt-oss-120b:free'],
  },
];

export function findHostedProvider(id: string): HostedProvider | null {
  return HOSTED_PROVIDERS.find((provider) => provider.id === id) ?? null;
}

const MAX_MODEL_ID_LENGTH = 200;

/** Non-empty, bounded, no whitespace. Whether the provider really serves it is checked against its list. */
export function isValidHostedModelId(model: string): boolean {
  return model.length > 0 && model.length <= MAX_MODEL_ID_LENGTH && !/\s/.test(model);
}

const MIN_API_KEY_LENGTH = 8;
const MAX_API_KEY_LENGTH = 500;

export function isValidApiKey(key: string): boolean {
  return key.length >= MIN_API_KEY_LENGTH && key.length <= MAX_API_KEY_LENGTH && !/\s/.test(key);
}

/** The only part of a key that is ever shown again: its last four characters. */
export function apiKeyHint(key: string): string {
  return key.slice(-4);
}

export type ModelChoice =
  { source: 'local'; model: string | null } | { source: 'hosted'; provider: string; model: string };

/** How a choice is written in the audit log: `local:qwen3:8b`, `hosted:groq/openai/gpt-oss-20b`. */
export function describeChoice(choice: ModelChoice): string {
  return choice.source === 'hosted'
    ? `hosted:${choice.provider}/${choice.model}`
    : `local:${choice.model ?? 'default'}`;
}

/** The provider lists the model ids a key can use; the saved one must be among them. */
export function isModelListed(listed: readonly string[], model: string): boolean {
  return listed.includes(model);
}
