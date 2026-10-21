import {
  HostedProviderError,
  HostedProviderKeyInvalidError,
  isHostedRaw,
} from './ports/hosted-provider';
import type { LanguageModel, ModelMessage, ModelRequest, ModelTurn } from './ports/language-model';

/**
 * A turn of the hosted model carries that provider's own message in `raw`, and a tool result
 * answers one of its calls. Another provider cannot continue from them: they are left out and
 * the model it falls back to asks its tools again.
 */
export function withoutHostedTurns(messages: ModelMessage[]): ModelMessage[] {
  const kept: ModelMessage[] = [];
  let skipResults = false;
  for (const message of messages) {
    if (message.role === 'assistant' && isHostedRaw(message.raw)) {
      skipResults = true;
      continue;
    }
    if (message.role === 'tool_results' && skipResults) continue;
    skipResults = false;
    kept.push(message);
  }
  return kept;
}

/**
 * ADR-019: the cooperative's hosted model answers; when its provider fails (key rejected, quota,
 * overload, timeout, anything the provider did wrong) the server's own model takes over for the
 * rest of the request so the assistant keeps working. The failure is logged without the key.
 */
export class FallbackLanguageModel implements LanguageModel {
  private fellBack = false;

  constructor(
    private readonly primary: LanguageModel,
    private readonly fallback: () => Promise<LanguageModel | null>,
    private readonly onFallback: (error: HostedProviderError) => void,
  ) {}

  async generate(request: ModelRequest): Promise<ModelTurn> {
    if (!this.fellBack) {
      try {
        return await this.primary.generate(request);
      } catch (error) {
        if (!(error instanceof HostedProviderError)) throw error;
        const next = await this.fallback();
        if (!next) throw error;
        this.onFallback(error);
        this.fellBack = true;
        return next.generate({ ...request, messages: withoutHostedTurns(request.messages) });
      }
    }
    const next = await this.fallback();
    if (!next) throw new HostedProviderError('No model to fall back to.');
    return next.generate({ ...request, messages: withoutHostedTurns(request.messages) });
  }
}

/** A warning line for the operator: what failed and where, never the key. */
export function describeFallback(cooperativeId: string, error: HostedProviderError): string {
  const reason = error instanceof HostedProviderKeyInvalidError ? 'key_invalid' : 'provider_error';
  return JSON.stringify({
    event: 'assistant_hosted_fallback',
    cooperativeId,
    reason,
    status: error.status ?? null,
  });
}
