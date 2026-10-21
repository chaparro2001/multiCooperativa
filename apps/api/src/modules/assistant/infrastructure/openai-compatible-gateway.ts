import {
  HostedProviderError,
  type HostedProviderGateway,
  HostedProviderTransientError,
} from '../application/ports/hosted-provider';
import type { LanguageModel } from '../application/ports/language-model';
import { findHostedProvider, type HostedProviderId } from '../domain/hosted-provider';
import { errorForStatus, OpenAICompatibleLanguageModel } from './openai-compatible-language-model';

/** Verifying a key on save must not hold the administrator's request for long. */
const MODELS_TIMEOUT_MS = 10_000;

function baseUrlOf(provider: HostedProviderId): string {
  const entry = findHostedProvider(provider);
  if (!entry) throw new HostedProviderError(`Unknown provider: ${provider}.`);
  return entry.baseUrl;
}

/** The fixed catalog of providers (ADR-019): the base URL always comes from the domain, never from a client. */
export class OpenAICompatibleGateway implements HostedProviderGateway {
  constructor(
    private readonly doFetch: typeof fetch = fetch,
    private readonly timeoutMs?: number,
  ) {}

  /** `GET {baseUrl}/models`: also the cheapest way to check a key. */
  async listModels(provider: HostedProviderId, apiKey: string): Promise<readonly string[]> {
    let response: Response;
    try {
      response = await this.doFetch(`${baseUrlOf(provider)}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
      });
    } catch {
      throw new HostedProviderTransientError('Cannot reach the provider.');
    }
    if (!response.ok) throw errorForStatus(response.status, 'The model list');
    try {
      const body = (await response.json()) as { data?: { id?: unknown }[] };
      return (body.data ?? []).flatMap((entry) => (typeof entry.id === 'string' ? [entry.id] : []));
    } catch {
      throw new HostedProviderError('Unreadable model list from the provider.');
    }
  }

  createModel(provider: HostedProviderId, model: string, apiKey: string): LanguageModel {
    return new OpenAICompatibleLanguageModel(
      { baseUrl: baseUrlOf(provider), model, apiKey, timeoutMs: this.timeoutMs },
      this.doFetch,
    );
  }
}
