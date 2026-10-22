import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type CooperativeContext, ModuleAccessDeniedError } from '../../access';
import {
  getAssistantModelSettings,
  MODEL_CHANGED_ACTION,
  resolveCooperativeLanguageModel,
  setAssistantModel,
  setHostedProvider,
  useLocalSource,
  type ModelSettingsDeps,
} from './assistant-model-settings';
import { createConversation, sendMessage, type AssistantDeps } from './assistant';
import {
  ApiKeyRequiredError,
  HostedProviderUnavailableError,
  ModelNotAvailableError,
  ProviderKeyInvalidError,
  ProviderUnreachableError,
} from './errors';
import {
  HostedProviderError,
  HostedProviderKeyInvalidError,
  HostedProviderTransientError,
  HOSTED_RAW_MARK,
} from './ports/hosted-provider';
import type { LanguageModel, ModelRequest } from './ports/language-model';
import type { AssistantSettingStore, LocalModelRuntime } from './ports/local-models';
import { FakeHostedGateway, FakeSecretCipher, InMemoryHostedStore } from './testing/hosted-fakes';
import { InMemoryConversationStore } from './testing/in-memory-conversation-store';
import { say, ScriptedLanguageModel } from './testing/scripted-language-model';

/** US-AI-07 (extended), ADR-019: a cooperative's own key at a hosted provider. */

const COOP = '11111111-1111-4111-8111-111111111111';
const OTHER_COOP = '22222222-2222-4222-8222-222222222222';
const KEY = 'gsk_cooperative-key-abcd';

const grant = (module: string, level: 'read' | 'manage') =>
  ({ module, level, scope: 'all' }) as const;
const contextOf = (
  permissions: ReturnType<typeof grant>[],
  cooperativeId = COOP,
): CooperativeContext =>
  ({
    userId: 'u1',
    sessionId: 's1',
    cooperativeId,
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
  async installed() {
    return ['qwen3:8b', 'qwen3:4b-instruct'];
  }
  create(model: string): LanguageModel {
    return new ScriptedLanguageModel(() => say(`local answer from ${model}`));
  }
}

/** Like the Prisma store: choosing a local model leaves the hosted provider and erases its key. */
class FakeSettings implements AssistantSettingStore {
  readonly rows = new Map<string, string>();
  constructor(private readonly hosted: InMemoryHostedStore) {}
  async getModel(cooperativeId: string) {
    return this.rows.get(cooperativeId) ?? null;
  }
  async setModel(cooperativeId: string, model: string | null) {
    if (model === null) this.rows.delete(cooperativeId);
    else this.rows.set(cooperativeId, model);
    await this.hosted.clearHosted(cooperativeId);
  }
}

let store: InMemoryHostedStore;
let gateway: FakeHostedGateway;
let cipher: FakeSecretCipher | null;
let audits: { cooperativeId: string; event: { action: string; detail: Record<string, unknown> } }[];
let deps: ModelSettingsDeps;

const build = (local: LocalModelRuntime | null = new FakeRuntime()): ModelSettingsDeps => ({
  local,
  settings: new FakeSettings(store),
  audit: async (cooperativeId, event) => {
    audits.push({ cooperativeId, event });
  },
  hosted: { store, gateway, cipher },
});

beforeEach(() => {
  store = new InMemoryHostedStore();
  gateway = new FakeHostedGateway();
  cipher = new FakeSecretCipher();
  audits = [];
  deps = build();
});

afterEach(() => vi.restoreAllMocks());

const groq = { provider: 'groq', model: 'openai/gpt-oss-20b', apiKey: KEY } as const;

describe('getAssistantModelSettings with hosted providers', () => {
  it('lists the catalog and reports no hosted config by default', async () => {
    const result = await getAssistantModelSettings(deps, admin);
    expect(result).toMatchObject({ source: 'local', hostedAvailable: true, hosted: null });
    expect(result.providers.map((provider) => provider.id)).toEqual([
      'groq',
      'mistral',
      'nvidia',
      'openrouter',
    ]);
    expect(result.providers[0]?.suggestedModels).toContain('openai/gpt-oss-20b');
  });

  it('reports hosted as unavailable without a secrets key (no cipher)', async () => {
    cipher = null;
    const result = await getAssistantModelSettings(build(), admin);
    expect(result).toMatchObject({ hostedAvailable: false, hosted: null, providers: [] });
  });

  it('denies a profile without the users module (403)', async () => {
    await expect(getAssistantModelSettings(deps, manager)).rejects.toBeInstanceOf(
      ModuleAccessDeniedError,
    );
  });
});

describe('setHostedProvider', () => {
  it('verifies the key against the provider, stores it encrypted and never returns it (BR-AI-10)', async () => {
    const result = await setHostedProvider(deps, admin, groq);

    expect(gateway.listCalls).toEqual([{ provider: 'groq', apiKey: KEY }]);
    expect(result).toMatchObject({
      source: 'hosted',
      hosted: { provider: 'groq', model: 'openai/gpt-oss-20b', keyHint: 'abcd' },
    });
    expect(JSON.stringify(result)).not.toContain(KEY);
    const stored = store.rows.get(COOP);
    expect(JSON.stringify(stored)).not.toContain(KEY);
    expect(cipher?.decrypt(stored!.key)).toBe(KEY);
  });

  it('audits the change as previous and new choice, without the key', async () => {
    await setHostedProvider(deps, admin, groq);
    expect(audits).toEqual([
      {
        cooperativeId: COOP,
        event: {
          actorUserId: 'u1',
          action: MODEL_CHANGED_ACTION,
          detail: { from: 'local:qwen3:8b', to: 'hosted:groq/openai/gpt-oss-20b' },
        },
      },
    ]);
    expect(JSON.stringify(audits)).not.toContain(KEY);
  });

  it('is unavailable (409) without a secrets key and saves nothing', async () => {
    cipher = null;
    await expect(setHostedProvider(build(), admin, groq)).rejects.toBeInstanceOf(
      HostedProviderUnavailableError,
    );
    expect(store.rows.size).toBe(0);
    expect(gateway.listCalls).toEqual([]);
  });

  it('requires the API key the first time', async () => {
    await expect(
      setHostedProvider(deps, admin, { provider: 'groq', model: 'openai/gpt-oss-20b' }),
    ).rejects.toBeInstanceOf(ApiKeyRequiredError);
    expect(gateway.listCalls).toEqual([]);
  });

  it('keeps the stored key when none is sent and the provider is the same', async () => {
    await setHostedProvider(deps, admin, groq);
    const before = store.rows.get(COOP)!;

    const result = await setHostedProvider(deps, admin, {
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    });

    expect(gateway.listCalls.at(-1)).toEqual({ provider: 'groq', apiKey: KEY });
    expect(result.hosted).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      keyHint: 'abcd',
    });
    expect(store.rows.get(COOP)?.key).toEqual(before.key);
  });

  it('requires a new key when the provider changes', async () => {
    await setHostedProvider(deps, admin, groq);
    await expect(
      setHostedProvider(deps, admin, { provider: 'mistral', model: 'openai/gpt-oss-20b' }),
    ).rejects.toBeInstanceOf(ApiKeyRequiredError);
    expect(store.rows.get(COOP)?.provider).toBe('groq');
  });

  it('requires a new key when the stored one cannot be decrypted (master key rotated)', async () => {
    await setHostedProvider(deps, admin, groq);
    cipher = new FakeSecretCipher('master-2');
    await expect(
      setHostedProvider(build(), admin, { provider: 'groq', model: 'openai/gpt-oss-20b' }),
    ).rejects.toBeInstanceOf(ApiKeyRequiredError);
  });

  it('replaces the key when a new one is sent and audits it even if nothing else changed', async () => {
    await setHostedProvider(deps, admin, groq);
    audits.length = 0;
    await setHostedProvider(deps, admin, { ...groq, apiKey: 'gsk_rotated-key-wxyz' });
    expect(store.rows.get(COOP)?.keyHint).toBe('wxyz');
    expect(audits).toHaveLength(1);
  });

  it('does not audit saving the same configuration without a new key', async () => {
    await setHostedProvider(deps, admin, groq);
    audits.length = 0;
    await setHostedProvider(deps, admin, { provider: 'groq', model: 'openai/gpt-oss-20b' });
    expect(audits).toEqual([]);
  });

  it('answers 422 key invalid when the provider rejects the key, and saves nothing', async () => {
    gateway.failure = new HostedProviderKeyInvalidError('rejected', 401);
    await expect(setHostedProvider(deps, admin, groq)).rejects.toBeInstanceOf(
      ProviderKeyInvalidError,
    );
    expect(store.rows.size).toBe(0);
    expect(audits).toEqual([]);
  });

  it('answers 422 model not available when the provider does not list it', async () => {
    await expect(
      setHostedProvider(deps, admin, { ...groq, model: 'made/up-model' }),
    ).rejects.toBeInstanceOf(ModelNotAvailableError);
    expect(store.rows.size).toBe(0);
  });

  it('answers 502 unreachable when the model list fails for another reason', async () => {
    gateway.failure = new HostedProviderTransientError('down', 503);
    await expect(setHostedProvider(deps, admin, groq)).rejects.toBeInstanceOf(
      ProviderUnreachableError,
    );
    expect(store.rows.size).toBe(0);
  });

  it('rejects a provider outside the catalog and a malformed model id before any call', async () => {
    await expect(
      setHostedProvider(deps, admin, { ...groq, provider: 'https://evil.test' as never }),
    ).rejects.toBeInstanceOf(ModelNotAvailableError);
    await expect(setHostedProvider(deps, admin, { ...groq, model: 'a b' })).rejects.toBeInstanceOf(
      ModelNotAvailableError,
    );
    expect(gateway.listCalls).toEqual([]);
  });

  it('denies a profile without the users module and verifies nothing (403)', async () => {
    await expect(setHostedProvider(deps, manager, groq)).rejects.toBeInstanceOf(
      ModuleAccessDeniedError,
    );
    expect(gateway.listCalls).toEqual([]);
    expect(store.rows.size).toBe(0);
  });

  it('keeps cooperatives apart', async () => {
    await setHostedProvider(deps, admin, groq);
    const other = await getAssistantModelSettings(
      deps,
      contextOf([grant('users', 'manage')], OTHER_COOP),
    );
    expect(other.hosted).toBeNull();
  });
});

describe('going back to local', () => {
  it('{source: local} erases the key and audits the change', async () => {
    await setHostedProvider(deps, admin, groq);
    audits.length = 0;
    const result = await useLocalSource(deps, admin);
    expect(result).toMatchObject({ source: 'local', hosted: null });
    expect(store.rows.size).toBe(0);
    expect(audits[0]?.event.detail).toEqual({
      from: 'hosted:groq/openai/gpt-oss-20b',
      to: 'local:qwen3:8b',
    });
  });

  it('choosing a local model also leaves the hosted provider and erases the key', async () => {
    await setHostedProvider(deps, admin, groq);
    const result = await setAssistantModel(deps, admin, 'qwen3:4b-instruct');
    expect(result).toMatchObject({ source: 'local', hosted: null, current: 'qwen3:4b-instruct' });
    expect(store.rows.size).toBe(0);
  });

  it('works when the assistant runs on Gemini (no local runtime)', async () => {
    const gemini = build(null);
    await setHostedProvider(gemini, admin, groq);
    expect((await useLocalSource(gemini, admin)).source).toBe('local');
  });
});

describe('the assistant uses the hosted provider (ADR-019)', () => {
  const hostedModel = (script: (request: ModelRequest) => never | ReturnType<typeof say>) =>
    new ScriptedLanguageModel(script);

  function assistantDeps(server: LanguageModel | null): AssistantDeps {
    return {
      conversations: new InMemoryConversationStore(),
      model: server,
      localModels: deps,
      executors: {} as AssistantDeps['executors'],
      now: () => new Date('2026-10-21T10:00:00Z'),
      today: () => '2026-10-21',
      messageLimitPerHour: 30,
    };
  }

  async function ask(assistant: AssistantDeps) {
    const conversation = await createConversation(assistant, admin);
    const { answer } = await sendMessage(assistant, admin, conversation.id, 'hello');
    return answer.content;
  }

  beforeEach(async () => {
    await setHostedProvider(deps, admin, groq);
  });

  it('answers with the hosted model built with the decrypted key', async () => {
    gateway.chatModel = hostedModel(() => say('hosted answer'));
    expect(await ask(assistantDeps(null))).toBe('hosted answer');
    expect(gateway.created).toEqual([
      { provider: 'groq', model: 'openai/gpt-oss-20b', apiKey: KEY },
    ]);
  });

  it('works whatever the server provider is (also with no server model at all)', async () => {
    gateway.chatModel = hostedModel(() => say('hosted answer'));
    const gemini = { ...deps, local: null };
    expect(await ask({ ...assistantDeps(null), localModels: gemini })).toBe('hosted answer');
  });

  it.each([
    ['transient', new HostedProviderTransientError('busy', 429)],
    ['key invalid', new HostedProviderKeyInvalidError('rejected', 401)],
  ])(
    'falls back to the server model on a %s error, warning without the key',
    async (_name, error) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      gateway.chatModel = hostedModel(() => {
        throw error;
      });
      expect(await ask(assistantDeps(null))).toBe('local answer from qwen3:8b');
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0]?.[0])).not.toContain(KEY);
    },
  );

  it('falls back to the default model when the server runs on Gemini', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    gateway.chatModel = hostedModel(() => {
      throw new HostedProviderTransientError('busy', 503);
    });
    const server = new ScriptedLanguageModel(() => say('gemini answer'));
    expect(await ask({ ...assistantDeps(server), localModels: { ...deps, local: null } })).toBe(
      'gemini answer',
    );
  });

  it('falls back when the stored key cannot be decrypted (master key rotated)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    gateway.chatModel = hostedModel(() => say('hosted answer'));
    const rotated = {
      ...deps,
      hosted: { store, gateway, cipher: new FakeSecretCipher('master-2') },
    };
    const model = await resolveCooperativeLanguageModel(rotated, null, COOP);
    expect((await model!.generate({ system: '', messages: [], tools: [] })).text).toBe(
      'local answer from qwen3:8b',
    );
    expect(gateway.created).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('does not hide an error that is not the provider’s (assistant unavailable stays 503)', async () => {
    gateway.chatModel = hostedModel(() => {
      throw new Error('bug');
    });
    await expect(ask(assistantDeps(null))).rejects.toMatchObject({ code: 'assistant_unavailable' });
  });

  it('with no usable fallback the provider failure surfaces as unavailable', async () => {
    gateway.chatModel = hostedModel(() => {
      throw new HostedProviderTransientError('busy', 503);
    });
    await expect(
      ask({ ...assistantDeps(null), localModels: { ...deps, local: null } }),
    ).rejects.toMatchObject({ code: 'assistant_unavailable' });
  });

  it('stays on the fallback for the rest of the request and drops the hosted turns it cannot continue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hosted: LanguageModel = {
      generate: async () => {
        throw new HostedProviderError('boom');
      },
    };
    const fallback = new ScriptedLanguageModel(() => say('ok'));
    const { FallbackLanguageModel } = await import('./fallback-language-model');
    const model = new FallbackLanguageModel(
      hosted,
      async () => fallback,
      () => {},
    );
    await model.generate({
      system: 's',
      tools: [],
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: '', raw: { provider: HOSTED_RAW_MARK, message: {} } },
        {
          role: 'tool_results',
          results: [{ callId: 'c', name: 't', content: '[]', isError: false }],
        },
      ],
    });
    expect(fallback.requests[0]?.messages).toEqual([{ role: 'user', content: 'q' }]);
  });

  it('a cooperative without hosted config is unaffected', async () => {
    gateway.chatModel = hostedModel(() => say('hosted answer'));
    const other = contextOf([grant('assistant', 'read'), grant('users', 'manage')], OTHER_COOP);
    const assistant = assistantDeps(null);
    const conversation = await createConversation(assistant, other);
    const { answer } = await sendMessage(assistant, other, conversation.id, 'hello');
    expect(answer.content).toBe('local answer from qwen3:8b');
  });
});
