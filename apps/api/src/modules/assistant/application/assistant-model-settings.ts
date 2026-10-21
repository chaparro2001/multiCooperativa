import type { AssistantModelSettings } from '@multicooperativa/contracts';

import { requireAccess } from '../../access';
import { effectiveModel, isSelectable, offeredModels } from '../domain/assistant-model';
import type { CooperativeContext } from './data-sources';
import { LocalModelNotInUseError, ModelNotAvailableError } from './errors';
import type { AssistantSettingStore, AuditRecorder, LocalModelRuntime } from './ports/local-models';

export interface ModelSettingsDeps {
  /** Null when the provider is Gemini: there is no local model to choose (US-AI-07). */
  local: LocalModelRuntime | null;
  settings: AssistantSettingStore;
  audit: AuditRecorder;
}

export const MODEL_CHANGED_ACTION = 'assistant.model_changed';

/** US-AI-07: whoever administers the cooperative (users module, manage level) decides; nobody else sees it. */
function requireAdministration(context: CooperativeContext): void {
  requireAccess(context.permissions, 'users', 'manage');
}

async function read(deps: ModelSettingsDeps, cooperativeId: string) {
  const { local } = deps;
  if (!local) return null;
  const [installed, saved] = await Promise.all([
    local.installed(),
    deps.settings.getModel(cooperativeId),
  ]);
  const offered = offeredModels(local.allowed, installed);
  return { local, saved, offered, current: effectiveModel(saved, local.defaultModel, offered) };
}

export async function getAssistantModelSettings(
  deps: ModelSettingsDeps,
  context: CooperativeContext,
): Promise<AssistantModelSettings> {
  requireAdministration(context);
  const state = await read(deps, context.cooperativeId);
  if (!state) return { provider: 'gemini', current: null, default: null, options: [] };
  return {
    provider: 'ollama',
    current: state.current,
    default: state.local.defaultModel,
    options: state.offered.map((id) => ({ id })),
  };
}

/** `null` goes back to the server default. The change is audited (US-ACC-12). */
export async function setAssistantModel(
  deps: ModelSettingsDeps,
  context: CooperativeContext,
  model: string | null,
): Promise<AssistantModelSettings> {
  requireAdministration(context);
  const state = await read(deps, context.cooperativeId);
  if (!state) throw new LocalModelNotInUseError();
  if (!isSelectable(model, state.offered)) throw new ModelNotAvailableError(model ?? '');

  await deps.settings.setModel(context.cooperativeId, model);
  const current = effectiveModel(model, state.local.defaultModel, state.offered);
  if (current !== state.current) {
    await deps.audit(context.cooperativeId, {
      actorUserId: context.userId,
      action: MODEL_CHANGED_ACTION,
      detail: { from: state.current, to: current },
    });
  }
  return {
    provider: 'ollama',
    current,
    default: state.local.defaultModel,
    options: state.offered.map((id) => ({ id })),
  };
}

/** The model one request of this cooperative runs on (BR-AI-09). */
export async function resolveCooperativeModel(
  deps: ModelSettingsDeps,
  cooperativeId: string,
): Promise<string | null> {
  const state = await read(deps, cooperativeId);
  return state?.current ?? null;
}
