import { beforeEach, describe, expect, it } from 'vitest';

import { type CooperativeContext, ModuleAccessDeniedError } from '../../access';
import { createConversation, sendMessage, type AssistantDeps } from './assistant';
import {
  getAssistantModelSettings,
  MODEL_CHANGED_ACTION,
  resolveCooperativeModel,
  setAssistantModel,
  type ModelSettingsDeps,
} from './assistant-model-settings';
import { LocalModelNotInUseError, ModelNotAvailableError } from './errors';
import type { LanguageModel } from './ports/language-model';
import type { AssistantSettingStore, LocalModelRuntime } from './ports/local-models';
import { CapturingLogger } from './testing/capturing-logger';
import { InMemoryConversationStore } from './testing/in-memory-conversation-store';
import { say, ScriptedLanguageModel } from './testing/scripted-language-model';

const COOP = '11111111-1111-4111-8111-111111111111';
const OTHER_COOP = '22222222-2222-4222-8222-222222222222';

const grant = (module: string, level: 'read' | 'manage') =>
  ({ module, level, scope: 'all' }) as const;
const contextOf = (permissions: ReturnType<typeof grant>[]): CooperativeContext =>
  ({
    userId: 'u1',
    sessionId: 's1',
    cooperativeId: COOP,
    membershipId: 'm1',
    profileName: 'x',
    isPartner: false,
    permissions,
  }) as unknown as CooperativeContext;
const admin = contextOf([grant('assistant', 'read'), grant('users', 'manage')]);
const manager = contextOf([grant('assistant', 'read'), grant('invoicing', 'manage')]);

class FakeRuntime implements LocalModelRuntime {
  readonly defaultModel = 'qwen3:8b';
  readonly allowed = ['qwen3:8b', 'qwen3:4b-instruct'];
  installedModels: string[] | null = ['qwen3:8b', 'qwen3:4b-instruct', 'llama3:70b'];
  readonly created: string[] = [];
  readonly models = new Map<string, ScriptedLanguageModel>();
  async installed() {
    return this.installedModels;
  }
  create(model: string): LanguageModel {
    this.created.push(model);
    const scripted = new ScriptedLanguageModel([say(`answer from ${model}`)]);
    this.models.set(model, scripted);
    return scripted;
  }
}

class FakeSettings implements AssistantSettingStore {
  readonly rows = new Map<string, string>();
  async getModel(cooperativeId: string) {
    return this.rows.get(cooperativeId) ?? null;
  }
  async setModel(cooperativeId: string, model: string | null) {
    if (model === null) this.rows.delete(cooperativeId);
    else this.rows.set(cooperativeId, model);
  }
}

let runtime: FakeRuntime;
let settings: FakeSettings;
let audits: { cooperativeId: string; event: Parameters<ModelSettingsDeps['audit']>[1] }[];
let deps: ModelSettingsDeps;

beforeEach(() => {
  runtime = new FakeRuntime();
  settings = new FakeSettings();
  audits = [];
  deps = {
    local: runtime,
    settings,
    audit: async (cooperativeId, event) => {
      audits.push({ cooperativeId, event });
    },
  };
});

describe('getAssistantModelSettings (US-AI-07)', () => {
  it('offers only allowlisted models that are installed and marks the default as current', async () => {
    runtime.installedModels = ['qwen3:8b', 'llama3:70b'];
    expect(await getAssistantModelSettings(deps, admin)).toEqual({
      provider: 'ollama',
      current: 'qwen3:8b',
      default: 'qwen3:8b',
      options: [{ id: 'qwen3:8b' }],
      source: 'local',
      hostedAvailable: false,
      hosted: null,
      providers: [],
    });
  });

  it('shows the saved model as current', async () => {
    settings.rows.set(COOP, 'qwen3:4b-instruct');
    const result = await getAssistantModelSettings(deps, admin);
    expect(result.current).toBe('qwen3:4b-instruct');
    expect(result.options.map((option) => option.id)).toEqual(['qwen3:8b', 'qwen3:4b-instruct']);
  });

  it('reports the default as current when the saved model is no longer installed (BR-AI-09)', async () => {
    settings.rows.set(COOP, 'qwen3:4b-instruct');
    runtime.installedModels = ['qwen3:8b'];
    expect((await getAssistantModelSettings(deps, admin)).current).toBe('qwen3:8b');
  });

  it('says there is nothing to choose when the assistant runs on Gemini', async () => {
    expect(await getAssistantModelSettings({ ...deps, local: null }, admin)).toEqual({
      provider: 'gemini',
      current: null,
      default: null,
      options: [],
      source: 'local',
      hostedAvailable: false,
      hosted: null,
      providers: [],
    });
  });

  it('denies by default to a profile without the users module (403)', async () => {
    await expect(getAssistantModelSettings(deps, manager)).rejects.toBeInstanceOf(
      ModuleAccessDeniedError,
    );
  });

  it('denies "read" on users: managing is required', async () => {
    const reader = contextOf([grant('assistant', 'read'), grant('users', 'read')]);
    await expect(getAssistantModelSettings(deps, reader)).rejects.toBeInstanceOf(
      ModuleAccessDeniedError,
    );
  });
});

describe('setAssistantModel (US-AI-07)', () => {
  it('saves the choice for this cooperative only and audits it', async () => {
    const result = await setAssistantModel(deps, admin, 'qwen3:4b-instruct');
    expect(result.current).toBe('qwen3:4b-instruct');
    expect(settings.rows.get(COOP)).toBe('qwen3:4b-instruct');
    expect(settings.rows.has(OTHER_COOP)).toBe(false);
    expect(audits).toEqual([
      {
        cooperativeId: COOP,
        event: {
          actorUserId: 'u1',
          action: MODEL_CHANGED_ACTION,
          detail: { from: 'local:qwen3:8b', to: 'local:qwen3:4b-instruct' },
        },
      },
    ]);
  });

  it('goes back to the server default with null', async () => {
    settings.rows.set(COOP, 'qwen3:4b-instruct');
    const result = await setAssistantModel(deps, admin, null);
    expect(result.current).toBe('qwen3:8b');
    expect(settings.rows.has(COOP)).toBe(false);
    expect(audits[0]?.event.detail).toEqual({
      from: 'local:qwen3:4b-instruct',
      to: 'local:qwen3:8b',
    });
  });

  it('does not audit a change that changes nothing', async () => {
    await setAssistantModel(deps, admin, null);
    expect(audits).toEqual([]);
  });

  it('rejects a model that is installed but not allowlisted, and one allowlisted but not installed', async () => {
    await expect(setAssistantModel(deps, admin, 'llama3:70b')).rejects.toBeInstanceOf(
      ModelNotAvailableError,
    );
    runtime.installedModels = ['qwen3:8b'];
    await expect(setAssistantModel(deps, admin, 'qwen3:4b-instruct')).rejects.toBeInstanceOf(
      ModelNotAvailableError,
    );
    expect(settings.rows.size).toBe(0);
    expect(audits).toEqual([]);
  });

  it('is refused when the assistant runs on Gemini', async () => {
    await expect(
      setAssistantModel({ ...deps, local: null }, admin, 'qwen3:8b'),
    ).rejects.toBeInstanceOf(LocalModelNotInUseError);
  });

  it('denies a profile without the users module and changes nothing (403)', async () => {
    await expect(setAssistantModel(deps, manager, 'qwen3:4b-instruct')).rejects.toBeInstanceOf(
      ModuleAccessDeniedError,
    );
    expect(settings.rows.size).toBe(0);
  });
});

describe('the assistant uses the cooperative model (BR-AI-09)', () => {
  function assistantDeps(): AssistantDeps {
    return {
      conversations: new InMemoryConversationStore(),
      model: null,
      localModels: deps,
      executors: {} as AssistantDeps['executors'],
      now: () => new Date('2026-10-21T10:00:00Z'),
      today: () => '2026-10-21',
      messageLimitPerHour: 30,
      logger: new CapturingLogger(),
    };
  }

  async function ask(context: CooperativeContext) {
    const assistant = assistantDeps();
    const conversation = await createConversation(assistant, context);
    const { answer } = await sendMessage(assistant, context, conversation.id, 'hello');
    return answer.content;
  }

  it('answers with the saved model', async () => {
    settings.rows.set(COOP, 'qwen3:4b-instruct');
    expect(await ask(admin)).toBe('answer from qwen3:4b-instruct');
  });

  it('answers with the default when the cooperative has not chosen', async () => {
    expect(await ask(admin)).toBe('answer from qwen3:8b');
  });

  it('falls back to the default when the saved model disappeared', async () => {
    settings.rows.set(COOP, 'qwen3:4b-instruct');
    runtime.installedModels = ['qwen3:8b'];
    expect(await ask(admin)).toBe('answer from qwen3:8b');
  });

  it('keeps cooperatives apart: another cooperative is not affected', async () => {
    settings.rows.set(OTHER_COOP, 'qwen3:4b-instruct');
    expect(await resolveCooperativeModel(deps, COOP)).toBe('qwen3:8b');
    expect(await resolveCooperativeModel(deps, OTHER_COOP)).toBe('qwen3:4b-instruct');
  });

  it('is ignored with Gemini: resolve gives nothing', async () => {
    expect(await resolveCooperativeModel({ ...deps, local: null }, COOP)).toBeNull();
  });
});
