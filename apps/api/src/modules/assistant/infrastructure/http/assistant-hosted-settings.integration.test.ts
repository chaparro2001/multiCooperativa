import {
  assistantModelSettingsSchema,
  authTokensSchema,
  createConversationResponseSchema,
  listAuditResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { memberToken, TEST_PASSWORD } from '../../../../../test/members';
import { createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';
import {
  HostedProviderKeyInvalidError,
  HostedProviderTransientError,
} from '../../application/ports/hosted-provider';
import { FakeHostedGateway } from '../../application/testing/hosted-fakes';
import { say, ScriptedLanguageModel } from '../../application/testing/scripted-language-model';
import type { LanguageModel, LocalModelRuntime } from '../../index';

/** US-AI-07 (extended), ADR-018: a cooperative's own hosted provider key, with fakes (no network, no Ollama). */

const env = loadEnv(process.env);
const prisma = createTestPrisma();

class FakeRuntime implements LocalModelRuntime {
  readonly defaultModel = 'qwen3:8b';
  readonly allowed = ['qwen3:8b'];
  async installed() {
    return ['qwen3:8b'];
  }
  create(model: string): LanguageModel {
    return new ScriptedLanguageModel(() => say(`answer from ${model}`));
  }
}

const gateway = new FakeHostedGateway();
const SECRETS_KEY = Buffer.alloc(32, 9).toString('base64');
const deps = {
  embedder: new HashingEmbedder(),
  prisma,
  jwtSecret: env.JWT_SECRET,
  files: new InMemoryFileStorage(),
  authRateLimits: false as const,
  invitationSender: { send: async () => {} },
  assistantLocalModels: new FakeRuntime(),
};
const { app: plainApp } = createApi(deps);
const { app } = createApi({
  ...deps,
  assistantSecretsKey: SECRETS_KEY,
  assistantHostedGateway: gateway,
});

const KEY = 'gsk_cooperative-key-abcd';
const hosted = { source: 'hosted', provider: 'groq', model: 'openai/gpt-oss-20b' };

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

async function ask(token: string) {
  const base = `/cooperatives/${farm}/assistant`;
  const created = await request(app).post(`${base}/conversations`).set(as(token));
  const id = createConversationResponseSchema.parse(created.body).id;
  const response = await request(app)
    .post(`${base}/conversations/${id}/messages`)
    .set(as(token))
    .send({ content: 'hello' });
  expect(response.status).toBe(201);
  return (response.body as { answer: { content: string } }).answer.content;
}

const save = (body: object, token = admin, cooperativeId = farm) =>
  request(app).put(path(cooperativeId)).set(as(token)).send(body);

beforeEach(async () => {
  gateway.failure = null;
  gateway.models = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
  gateway.chatModel = new ScriptedLanguageModel(() => say('answer from the provider'));
  gateway.created.length = 0;
  gateway.listCalls.length = 0;
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

describe('PUT/GET assistant-model with a hosted provider (US-AI-07, ADR-018)', () => {
  it('without the secrets key hosted is unavailable and PUT answers 409', async () => {
    const get = await request(plainApp).get(path()).set(as(admin));
    expect(assistantModelSettingsSchema.parse(get.body)).toMatchObject({ hostedAvailable: false });
    const put = await request(plainApp)
      .put(path())
      .set(as(admin))
      .send({ ...hosted, apiKey: KEY });
    expect(put.status).toBe(409);
    expect(put.body.error).toBe('hosted_provider_unavailable');
  });

  it('stores the key encrypted, never returns it, answers with the provider and audits without it', async () => {
    const response = await save({ ...hosted, apiKey: KEY });
    expect(response.status).toBe(200);
    expect(assistantModelSettingsSchema.parse(response.body)).toMatchObject({
      source: 'hosted',
      hostedAvailable: true,
      hosted: { provider: 'groq', model: 'openai/gpt-oss-20b', keyHint: 'abcd' },
    });
    const get = await request(app).get(path()).set(as(admin));
    expect(JSON.stringify([response.body, get.body])).not.toContain(KEY);

    const row = await prisma.assistantSetting.findUniqueOrThrow({ where: { cooperativeId: farm } });
    expect(JSON.stringify(row)).not.toContain(KEY);
    expect(row.apiKeyCiphertext).toBeTruthy();

    expect(await ask(member)).toBe('answer from the provider');
    expect(gateway.created[0]).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      apiKey: KEY,
    });

    const audit = await request(app).get(`/cooperatives/${farm}/audit`).set(as(admin));
    expect(JSON.stringify(audit.body)).not.toContain(KEY);
    const event = listAuditResponseSchema
      .parse(audit.body)
      .events.find((candidate) => candidate.action === 'assistant.model_changed');
    expect(event?.detail).toEqual({ from: 'local:qwen3:8b', to: 'hosted:groq/openai/gpt-oss-20b' });
  });

  it('keeps the stored key when none is sent and requires one for another provider', async () => {
    await save({ ...hosted, apiKey: KEY });
    expect((await save({ ...hosted, model: 'openai/gpt-oss-120b' })).status).toBe(200);
    expect(gateway.listCalls.at(-1)?.apiKey).toBe(KEY);
    const other = await save({ ...hosted, provider: 'mistral' });
    expect([other.status, other.body.error]).toEqual([422, 'assistant_api_key_required']);
  });

  it('maps the verification failures to 422 and 502 and saves nothing', async () => {
    gateway.failure = new HostedProviderKeyInvalidError('rejected', 401);
    const invalid = await save({ ...hosted, apiKey: KEY });
    expect([invalid.status, invalid.body.error]).toEqual([422, 'assistant_provider_key_invalid']);

    gateway.failure = new HostedProviderTransientError('down', 503);
    const down = await save({ ...hosted, apiKey: KEY });
    expect([down.status, down.body.error]).toEqual([502, 'assistant_provider_unreachable']);

    gateway.failure = null;
    const unlisted = await save({ ...hosted, model: 'made/up', apiKey: KEY });
    expect([unlisted.status, unlisted.body.error]).toEqual([422, 'assistant_model_not_available']);
    expect(await prisma.assistantSetting.count()).toBe(0);
  });

  it('rejects unknown providers and extra fields (400): there is no free base URL', async () => {
    expect((await save({ ...hosted, provider: 'https://evil.test', apiKey: KEY })).status).toBe(
      400,
    );
    expect((await save({ ...hosted, apiKey: KEY, baseUrl: 'https://evil.test' })).status).toBe(400);
    expect(gateway.listCalls).toEqual([]);
  });

  it('answers 403 without the users module and 404 for another cooperative', async () => {
    expect((await save({ ...hosted, apiKey: KEY }, manager)).status).toBe(403);
    expect((await save({ ...hosted, apiKey: KEY }, admin, sea)).status).toBe(404);
    expect(await prisma.assistantSetting.count()).toBe(0);
  });

  it('falls back to the server model when the provider fails', async () => {
    await save({ ...hosted, apiKey: KEY });
    gateway.chatModel = new ScriptedLanguageModel(() => {
      throw new HostedProviderTransientError('busy', 429);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await ask(member)).toBe('answer from qwen3:8b');
  });

  it('{ source: "local" } erases the stored key', async () => {
    await save({ ...hosted, apiKey: KEY });
    const response = await save({ source: 'local' });
    expect(response.status).toBe(200);
    expect(assistantModelSettingsSchema.parse(response.body)).toMatchObject({
      source: 'local',
      hosted: null,
    });
    expect(await prisma.assistantSetting.count()).toBe(0);
    expect(await ask(member)).toBe('answer from qwen3:8b');
  });

  it('does not touch another cooperative', async () => {
    await save({ ...hosted, apiKey: KEY });
    const other = await request(app).get(path(sea)).set(as(seaAdmin));
    expect(assistantModelSettingsSchema.parse(other.body)).toMatchObject({
      source: 'local',
      hosted: null,
    });
  });
});
