import type {
  AssistantModelSettings,
  AssistantSource,
  HostedProviderId,
  UpdateAssistantModelBody,
} from '@multicooperativa/contracts';

import { modelToSave } from './model-settings';

/** What the administrator is typing for an external provider (US-AI-07, ADR-019). The key is never kept after saving. */
export interface HostedDraft {
  provider: HostedProviderId | null;
  model: string;
  apiKey: string;
}

/** The form starts from what is saved; the key field always starts empty ("leave empty to keep"). */
export function hostedDraftFrom(settings: AssistantModelSettings): HostedDraft {
  return {
    provider: settings.hosted?.provider ?? null,
    model: settings.hosted?.model ?? '',
    apiKey: '',
  };
}

/** A key is optional only while the provider stays the one that already has a saved key. */
export function keyIsRequired(draft: HostedDraft, settings: AssistantModelSettings): boolean {
  return settings.hosted === null || settings.hosted.provider !== draft.provider;
}

/** Mirrors the API rules (the API has the last word): a provider, a model without spaces, and the key when needed. */
export function canSaveHosted(draft: HostedDraft, settings: AssistantModelSettings): boolean {
  const model = draft.model.trim();
  if (draft.provider === null || model === '' || /\s/.test(model) || model.length > 200) {
    return false;
  }
  if (draft.apiKey.trim() === '') return !keyIsRequired(draft, settings);
  return true;
}

export function hostedBody(draft: HostedDraft): UpdateAssistantModelBody {
  if (draft.provider === null) throw new Error('No provider selected');
  const apiKey = draft.apiKey.trim();
  return {
    source: 'hosted',
    provider: draft.provider,
    model: draft.model.trim(),
    ...(apiKey === '' ? {} : { apiKey }),
  };
}

/** Back to the server's own model: with Ollama the chosen model, with Gemini just the source. */
export function localBody(
  selected: string | null,
  settings: AssistantModelSettings,
): UpdateAssistantModelBody {
  return settings.provider === 'ollama' && selected !== null
    ? { model: modelToSave(selected, settings) }
    : { source: 'local' };
}

/** Nothing to save while the screen already shows the local source that is stored. */
export function isUnchangedLocal(
  source: AssistantSource,
  selected: string | null,
  settings: AssistantModelSettings,
): boolean {
  if (source !== 'local' || settings.source !== 'local') return false;
  return settings.provider !== 'ollama' || selected === settings.current;
}
