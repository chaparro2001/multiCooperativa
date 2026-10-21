import type { AssistantModelSettings, Module } from '@multicooperativa/contracts';

/**
 * US-AI-07: the section is shown to whoever administers the cooperative: the users module at
 * "manage" level. It only hides; the API answers 403 to anyone else (ADR-004).
 */
export function canChooseAssistantModel(
  permissions: readonly { module: Module; level: string }[] | undefined,
): boolean {
  return permissions?.some((p) => p.module === 'users' && p.level === 'manage') ?? false;
}

/** Hints the app knows how to word; any other installed model is shown by its id alone. */
const HINT_BY_MODEL: Record<string, 'accurate' | 'fast'> = {
  'qwen3:8b': 'accurate',
  'qwen3:4b-instruct': 'fast',
};

export function modelHint(modelId: string): 'accurate' | 'fast' | null {
  return HINT_BY_MODEL[modelId] ?? null;
}

/** Choosing the server default is stored as "no choice", so a later default change applies to this cooperative. */
export function modelToSave(
  selected: string,
  settings: Pick<AssistantModelSettings, 'default'>,
): string | null {
  return selected === settings.default ? null : selected;
}
