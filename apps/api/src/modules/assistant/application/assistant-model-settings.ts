import type { AssistantModelSettings } from '@multicooperativa/contracts';

import { requireAccess } from '../../access';
import {
  apiKeyHint,
  describeChoice,
  findHostedProvider,
  HOSTED_PROVIDERS,
  isModelListed,
  isValidApiKey,
  isValidHostedModelId,
  type HostedProviderId,
} from '../domain/hosted-provider';
import { effectiveModel, isSelectable, offeredModels } from '../domain/assistant-model';
import type { CooperativeContext } from './data-sources';
import {
  ApiKeyRequiredError,
  HostedProviderUnavailableError,
  LocalModelNotInUseError,
  ModelNotAvailableError,
  ProviderKeyInvalidError,
  ProviderUnreachableError,
} from './errors';
import type { Logger } from '../../../shared/logger';
import { describeFallback, FallbackLanguageModel } from './fallback-language-model';
import {
  type HostedProviderGateway,
  HostedProviderKeyInvalidError,
  type HostedSettingStore,
  type SecretCipher,
} from './ports/hosted-provider';
import type { LanguageModel } from './ports/language-model';
import type { AssistantSettingStore, AuditRecorder, LocalModelRuntime } from './ports/local-models';

/** The cooperative's own account at a hosted provider (ADR-019). */
export interface HostedModelDeps {
  store: HostedSettingStore;
  gateway: HostedProviderGateway;
  /** Null without ASSISTANT_SECRETS_KEY: keys cannot be stored, so hosted mode is unavailable. */
  cipher: SecretCipher | null;
}

export interface ModelSettingsDeps {
  /** Null when the provider is Gemini: there is no local model to choose (US-AI-07). */
  local: LocalModelRuntime | null;
  settings: AssistantSettingStore;
  audit: AuditRecorder;
  hosted?: HostedModelDeps;
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

/** The hosted dependencies, only when the server can keep keys. */
function hostedOf(deps: ModelSettingsDeps): (HostedModelDeps & { cipher: SecretCipher }) | null {
  return deps.hosted?.cipher ? { ...deps.hosted, cipher: deps.hosted.cipher } : null;
}

async function view(
  deps: ModelSettingsDeps,
  cooperativeId: string,
): Promise<AssistantModelSettings> {
  const [state, hostedDeps] = [await read(deps, cooperativeId), hostedOf(deps)];
  const hosted = hostedDeps ? await hostedDeps.store.getHosted(cooperativeId) : null;
  return {
    provider: state ? 'ollama' : 'gemini',
    current: state?.current ?? null,
    default: state?.local.defaultModel ?? null,
    options: state ? state.offered.map((id) => ({ id })) : [],
    source: hosted ? 'hosted' : 'local',
    hostedAvailable: hostedDeps !== null,
    // The key is never part of the answer: only its last four characters.
    hosted: hosted
      ? { provider: hosted.provider, model: hosted.model, keyHint: hosted.keyHint }
      : null,
    providers: hostedDeps
      ? HOSTED_PROVIDERS.map(({ id, suggestedModels }) => ({
          id,
          suggestedModels: [...suggestedModels],
        }))
      : [],
  };
}

/** What the cooperative's questions go to now, as it is written in the audit log. */
function choiceOf(settings: AssistantModelSettings): string {
  return settings.hosted
    ? describeChoice({ source: 'hosted', ...settings.hosted })
    : describeChoice({ source: 'local', model: settings.current });
}

async function auditChange(
  deps: ModelSettingsDeps,
  context: CooperativeContext,
  from: string,
  to: string,
  force = false,
) {
  if (from === to && !force) return;
  await deps.audit(context.cooperativeId, {
    actorUserId: context.userId,
    action: MODEL_CHANGED_ACTION,
    detail: { from, to },
  });
}

export async function getAssistantModelSettings(
  deps: ModelSettingsDeps,
  context: CooperativeContext,
): Promise<AssistantModelSettings> {
  requireAdministration(context);
  return view(deps, context.cooperativeId);
}

/**
 * Choose a local model (`null` goes back to the server default). It also leaves any hosted
 * provider and erases its key. The change is audited (US-ACC-12).
 */
export async function setAssistantModel(
  deps: ModelSettingsDeps,
  context: CooperativeContext,
  model: string | null,
): Promise<AssistantModelSettings> {
  requireAdministration(context);
  const state = await read(deps, context.cooperativeId);
  if (!state) throw new LocalModelNotInUseError();
  if (!isSelectable(model, state.offered)) throw new ModelNotAvailableError(model ?? '');

  const before = choiceOf(await view(deps, context.cooperativeId));
  await deps.settings.setModel(context.cooperativeId, model);
  const after = await view(deps, context.cooperativeId);
  await auditChange(deps, context, before, choiceOf(after));
  return after;
}

/** Back to the server's own model, keeping a saved local choice. The hosted key is erased. */
export async function useLocalSource(
  deps: ModelSettingsDeps,
  context: CooperativeContext,
): Promise<AssistantModelSettings> {
  requireAdministration(context);
  const before = choiceOf(await view(deps, context.cooperativeId));
  await deps.hosted?.store.clearHosted(context.cooperativeId);
  const after = await view(deps, context.cooperativeId);
  await auditChange(deps, context, before, choiceOf(after));
  return after;
}

export interface HostedChoice {
  provider: HostedProviderId;
  model: string;
  /** Required the first time and when the provider changes; omitted, the stored key is kept. */
  apiKey?: string;
}

/** The key to verify and store: the one sent, or the stored one while the provider stays the same. */
function keyFor(
  hosted: HostedModelDeps & { cipher: SecretCipher },
  choice: HostedChoice,
  stored: Awaited<ReturnType<HostedSettingStore['getHosted']>>,
): { key: string; replaced: boolean } {
  if (choice.apiKey !== undefined) return { key: choice.apiKey, replaced: true };
  if (stored && stored.provider === choice.provider) {
    try {
      return { key: hosted.cipher.decrypt(stored.key), replaced: false };
    } catch {
      // The master key changed: the stored key is lost and must be typed again.
    }
  }
  throw new ApiKeyRequiredError();
}

/**
 * US-AI-07, ADR-019: use the cooperative's own account at a hosted provider. The key is checked
 * against `GET /models` before anything is saved (401/403 -> key invalid, model not listed ->
 * not available, provider down -> unreachable) and is stored encrypted; it is never returned or audited.
 */
export async function setHostedProvider(
  deps: ModelSettingsDeps,
  context: CooperativeContext,
  choice: HostedChoice,
): Promise<AssistantModelSettings> {
  requireAdministration(context);
  const hosted = hostedOf(deps);
  if (!hosted) throw new HostedProviderUnavailableError();
  if (!findHostedProvider(choice.provider)) throw new ModelNotAvailableError(choice.model);
  if (!isValidHostedModelId(choice.model)) throw new ModelNotAvailableError(choice.model);
  if (choice.apiKey !== undefined && !isValidApiKey(choice.apiKey)) {
    throw new ProviderKeyInvalidError();
  }

  const { cooperativeId } = context;
  const stored = await hosted.store.getHosted(cooperativeId);
  const { key, replaced } = keyFor(hosted, choice, stored);

  let listed: readonly string[];
  try {
    listed = await hosted.gateway.listModels(choice.provider, key);
  } catch (error) {
    throw error instanceof HostedProviderKeyInvalidError
      ? new ProviderKeyInvalidError()
      : new ProviderUnreachableError();
  }
  if (!isModelListed(listed, choice.model)) throw new ModelNotAvailableError(choice.model);

  const before = choiceOf(await view(deps, cooperativeId));
  await hosted.store.setHosted(cooperativeId, {
    provider: choice.provider,
    model: choice.model,
    key: replaced || !stored ? hosted.cipher.encrypt(key) : stored.key,
    keyHint: apiKeyHint(key),
  });
  const after = await view(deps, cooperativeId);
  // A new key with the same provider and model changes nothing visible but is still worth a trace.
  await auditChange(deps, context, before, choiceOf(after), replaced);
  return after;
}

/** The model one request of this cooperative runs on (BR-AI-09). */
export async function resolveCooperativeModel(
  deps: ModelSettingsDeps,
  cooperativeId: string,
): Promise<string | null> {
  const state = await read(deps, cooperativeId);
  return state?.current ?? null;
}

/** The server's own model for this cooperative: its local choice, or the default one. */
async function resolveServerModel(
  deps: ModelSettingsDeps | undefined,
  defaultModel: LanguageModel | null,
  cooperativeId: string,
): Promise<LanguageModel | null> {
  const local = deps?.local;
  if (!deps || !local) return defaultModel;
  return local.create((await resolveCooperativeModel(deps, cooperativeId)) ?? local.defaultModel);
}

/**
 * The model one request of this cooperative runs on. A cooperative on a hosted provider uses its
 * own decrypted key and, when that provider fails, the server's own model answers instead
 * (ADR-019); everyone else gets the local choice (ADR-014) or the default model. A stored key
 * that cannot be decrypted (the master key changed) also falls back to the server's model.
 */
export async function resolveCooperativeLanguageModel(
  deps: ModelSettingsDeps | undefined,
  defaultModel: LanguageModel | null,
  cooperativeId: string,
  logger: Logger,
): Promise<LanguageModel | null> {
  const server = () => resolveServerModel(deps, defaultModel, cooperativeId);
  const hosted = deps ? hostedOf(deps) : null;
  const saved = hosted ? await hosted.store.getHosted(cooperativeId) : null;
  if (!hosted || !saved) return server();

  let apiKey: string;
  try {
    apiKey = hosted.cipher.decrypt(saved.key);
  } catch {
    logger.warn('assistant_hosted_key_unreadable', { cooperativeId });
    return server();
  }
  return new FallbackLanguageModel(
    hosted.gateway.createModel(saved.provider, saved.model, apiKey),
    server,
    (error) => logger.warn('assistant_hosted_fallback', describeFallback(cooperativeId, error)),
  );
}
