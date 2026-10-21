import {
  assistantModelSettingsSchema,
  authTokensSchema,
  createConversationResponseSchema,
  listAuditResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { memberToken, TEST_PASSWORD } from '../../../../../test/members';
import { createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';
import type { LanguageModel, LocalModelRuntime } from '../../index';
import { say, ScriptedLanguageModel } from '../../application/testing/scripted-language-model';

/** US-AI-07, BR-AI-09: the per-cooperative local model, with a fake runtime (no Ollama). */

const env = loadEnv(process.env);
const prisma = createTestPrisma();

class FakeRuntime implements LocalModelRuntime {
  readonly defaultModel = 'qwen3:8b';
  readonly allowed = ['qwen3:8b', 'qwen3:4b-instruct'];
  installedModels: string[] = ['qwen3:8b', 'qwen3:4b-instruct', 'llama3:70b'];
  readonly models = new Map<string, ScriptedLanguageModel>();
  async installed() {
    return this.installedModels;
  }
  create(model: string): LanguageModel {
    let existing = this.models.get(model);
    if (!existing) {
      existing = new ScriptedLanguageModel(() => say(`answer from ${model}`));
      this.models.set(model, existing);
    }
    return existing;
  }
}

const runtime = new FakeRuntime();
const deps = {
  embedder: new HashingEmbedder(),
  prisma,
  jwtSecret: env.JWT_SECRET,
  files: new InMemoryFileStorage(),
  authRateLimits: false as const,
  invitationSender: { send: async () => {} },
};
const { app } = createApi({ ...deps, assistantLocalModels: runtime });
// A second API where the assistant runs on Gemini: no local runtime.
const { app: geminiApp } = createApi({ ...deps, languageModel: new ScriptedLanguageModel([]) });

let farm: string;
let sea: string;
let admin: string;
let manager: string;
let member: string;
let seaAdmin: string;

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const path = (cooperativeId = farm) => `/cooperatives/${cooperativeId}/settings/assistant-model`;

async function login(email: string) {
  const response = await request(app).post('/auth/login').send({ email, password: TEST_PASSWORD });
  return authTokensSchema.parse(response.body).accessToken;
}

async function ask(token: string, cooperativeId = farm) {
  const base = `/cooperatives/${cooperativeId}/assistant`;
  const created = await request(app).post(`${base}/conversations`).set(as(token));
  const id = createConversationResponseSchema.parse(created.body).id;
  const response = await request(app)
    .post(`${base}/conversations/${id}/messages`)
    .set(as(token))
    .send({ content: 'hello' });
  expect(response.status).toBe(201);
  return (response.body as { answer: { content: string } }).answer.content;
}

beforeEach(async () => {
  runtime.installedModels = ['qwen3:8b', 'qwen3:4b-instruct', 'llama3:70b'];
  await resetDatabase(prisma);
  const access = createAccessModule({
    prisma,
    jwtSecret: env.JWT_SECRET,
    invitationSender: { send: async () => {} },
  });
  farm = (
    await access.provisionCooperative({
      name: 'Farm',
      cif: 'F12345674',
      admin: { email: 'admin@farm.test', name: 'Ana', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  sea = (
    await access.provisionCooperative({
      name: 'Sea',
      cif: 'F76543214',
      admin: { email: 'admin@sea.test', name: 'Rosa', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  const base = { prisma, app };
  member = await memberToken(base, {
    cooperativeId: farm,
    email: 'member@farm.test',
    profileName: 'Socio',
    isPartner: true,
    passwordOf: 'admin@farm.test',
  });
  manager = await memberToken(base, {
    cooperativeId: farm,
    email: 'manager@farm.test',
    profileName: 'Gestor',
    isPartner: false,
    passwordOf: 'admin@farm.test',
  });
  [admin, seaAdmin] = await Promise.all([login('admin@farm.test'), login('admin@sea.test')]);
});

describe('GET /cooperatives/{id}/settings/assistant-model (US-AI-07)', () => {
  it('shows the administrator the offered models, with the default as current', async () => {
    const response = await request(app).get(path()).set(as(admin));
    expect(response.status).toBe(200);
    expect(assistantModelSettingsSchema.parse(response.body)).toEqual({
      provider: 'ollama',
      current: 'qwen3:8b',
      default: 'qwen3:8b',
      options: [{ id: 'qwen3:8b' }, { id: 'qwen3:4b-instruct' }],
      source: 'local',
      hostedAvailable: false,
      hosted: null,
      providers: [],
    });
  });

  it('does not offer a model that is not installed', async () => {
    runtime.installedModels = ['qwen3:8b'];
    const response = await request(app).get(path()).set(as(admin));
    expect(assistantModelSettingsSchema.parse(response.body).options).toEqual([{ id: 'qwen3:8b' }]);
  });

  it('answers 403 to profiles without the users module and 401 without a token', async () => {
    for (const token of [member, manager]) {
      const response = await request(app).get(path()).set(as(token));
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
    }
    expect((await request(app).get(path())).status).toBe(401);
  });

  it('answers 404 for another cooperative (isolation)', async () => {
    expect((await request(app).get(path(sea)).set(as(admin))).status).toBe(404);
    expect((await request(app).get(path(farm)).set(as(seaAdmin))).status).toBe(404);
  });

  it('says the local model is not in use when the assistant runs on Gemini', async () => {
    const response = await request(geminiApp).get(path()).set(as(admin));
    expect(assistantModelSettingsSchema.parse(response.body)).toEqual({
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
});

describe('PUT /cooperatives/{id}/settings/assistant-model (US-AI-07, BR-AI-09)', () => {
  it('saves the model, the assistant answers with it, and the change is audited', async () => {
    expect(await ask(admin)).toBe('answer from qwen3:8b');

    const response = await request(app)
      .put(path())
      .set(as(admin))
      .send({ model: 'qwen3:4b-instruct' });
    expect(response.status).toBe(200);
    expect(assistantModelSettingsSchema.parse(response.body).current).toBe('qwen3:4b-instruct');

    // Every member of the cooperative is now answered by that model.
    expect(await ask(admin)).toBe('answer from qwen3:4b-instruct');
    expect(await ask(member)).toBe('answer from qwen3:4b-instruct');

    const audit = await request(app).get(`/cooperatives/${farm}/audit`).set(as(admin));
    const event = listAuditResponseSchema
      .parse(audit.body)
      .events.find((candidate) => candidate.action === 'assistant.model_changed');
    expect(event?.detail).toEqual({ from: 'local:qwen3:8b', to: 'local:qwen3:4b-instruct' });
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@farm.test' } });
    expect(event?.actorUserId).toBe(adminUser.id);
  });

  it('does not change another cooperative', async () => {
    await request(app).put(path()).set(as(admin)).send({ model: 'qwen3:4b-instruct' });
    const other = await request(app).get(path(sea)).set(as(seaAdmin));
    expect(assistantModelSettingsSchema.parse(other.body).current).toBe('qwen3:8b');
    expect(await ask(seaAdmin, sea)).toBe('answer from qwen3:8b');
  });

  it('goes back to the default with null', async () => {
    await request(app).put(path()).set(as(admin)).send({ model: 'qwen3:4b-instruct' });
    const response = await request(app).put(path()).set(as(admin)).send({ model: null });
    expect(assistantModelSettingsSchema.parse(response.body).current).toBe('qwen3:8b');
    expect(await ask(admin)).toBe('answer from qwen3:8b');
  });

  it('falls back to the default when the saved model is no longer installed', async () => {
    await request(app).put(path()).set(as(admin)).send({ model: 'qwen3:4b-instruct' });
    runtime.installedModels = ['qwen3:8b'];
    expect(await ask(admin)).toBe('answer from qwen3:8b');
  });

  it('rejects a model outside the allowlist, even if installed (422), without side effects', async () => {
    const response = await request(app).put(path()).set(as(admin)).send({ model: 'llama3:70b' });
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('assistant_model_not_available');
    expect(await prisma.assistantSetting.count()).toBe(0);
  });

  it('rejects a malformed body (400)', async () => {
    expect((await request(app).put(path()).set(as(admin)).send({})).status).toBe(400);
    expect((await request(app).put(path()).set(as(admin)).send({ model: 5 })).status).toBe(400);
  });

  it('answers 403 to profiles without the users module and saves nothing', async () => {
    for (const token of [member, manager]) {
      const response = await request(app).put(path()).set(as(token)).send({ model: 'qwen3:8b' });
      expect(response.status).toBe(403);
    }
    expect(await prisma.assistantSetting.count()).toBe(0);
  });

  it('answers 404 for another cooperative and saves nothing', async () => {
    const response = await request(app)
      .put(path(sea))
      .set(as(admin))
      .send({ model: 'qwen3:4b-instruct' });
    expect(response.status).toBe(404);
    expect(await prisma.assistantSetting.count()).toBe(0);
  });

  it('answers 409 when the assistant runs on Gemini', async () => {
    const response = await request(geminiApp)
      .put(path())
      .set(as(admin))
      .send({ model: 'qwen3:8b' });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('local_model_not_in_use');
  });
});
