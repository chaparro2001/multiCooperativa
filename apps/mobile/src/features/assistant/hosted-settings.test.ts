import type { AssistantModelSettings } from '@multicooperativa/contracts';
import { describe, expect, it } from 'vitest';

import {
  canSaveHosted,
  hostedBody,
  hostedDraftFrom,
  isUnchangedLocal,
  keyIsRequired,
  localBody,
} from './hosted-settings';

const settingsOf = (overrides: Partial<AssistantModelSettings> = {}): AssistantModelSettings => ({
  provider: 'ollama',
  current: 'qwen3:8b',
  default: 'qwen3:8b',
  options: [{ id: 'qwen3:8b' }],
  source: 'local',
  hostedAvailable: true,
  hosted: null,
  providers: [{ id: 'groq', suggestedModels: ['openai/gpt-oss-20b'] }],
  ...overrides,
});
const savedHosted = settingsOf({
  source: 'hosted',
  hosted: { provider: 'groq', model: 'openai/gpt-oss-20b', keyHint: 'abcd' },
});

describe('external provider form (US-AI-07, ADR-018)', () => {
  it('starts from what is saved, with the key field empty', () => {
    expect(hostedDraftFrom(settingsOf())).toEqual({ provider: null, model: '', apiKey: '' });
    expect(hostedDraftFrom(savedHosted)).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      apiKey: '',
    });
  });

  it('requires the key the first time and when the provider changes, not to keep the saved one', () => {
    expect(keyIsRequired({ provider: 'groq', model: 'a', apiKey: '' }, settingsOf())).toBe(true);
    expect(keyIsRequired({ provider: 'groq', model: 'a', apiKey: '' }, savedHosted)).toBe(false);
    expect(keyIsRequired({ provider: 'mistral', model: 'a', apiKey: '' }, savedHosted)).toBe(true);
  });

  it('can save only with a provider, a model without spaces and the key when it is needed', () => {
    const ok = { provider: 'groq', model: 'openai/gpt-oss-20b', apiKey: 'gsk_0123456789' } as const;
    expect(canSaveHosted(ok, settingsOf())).toBe(true);
    expect(canSaveHosted({ ...ok, apiKey: '' }, settingsOf())).toBe(false);
    expect(canSaveHosted({ ...ok, apiKey: '' }, savedHosted)).toBe(true);
    expect(canSaveHosted({ ...ok, provider: null }, savedHosted)).toBe(false);
    expect(canSaveHosted({ ...ok, model: '  ' }, savedHosted)).toBe(false);
    expect(canSaveHosted({ ...ok, model: 'a b' }, savedHosted)).toBe(false);
  });

  it('sends the key only when one was typed', () => {
    const draft = { provider: 'groq', model: ' openai/gpt-oss-20b ', apiKey: '' } as const;
    expect(hostedBody(draft)).toEqual({
      source: 'hosted',
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
    });
    expect(hostedBody({ ...draft, apiKey: ' gsk_0123456789 ' })).toEqual({
      source: 'hosted',
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      apiKey: 'gsk_0123456789',
    });
  });

  it('goes back to local with the chosen model (Ollama) or just the source (Gemini)', () => {
    expect(localBody('qwen3:8b', settingsOf())).toEqual({ model: null });
    expect(localBody('qwen3:4b-instruct', settingsOf())).toEqual({ model: 'qwen3:4b-instruct' });
    expect(localBody(null, settingsOf({ provider: 'gemini', default: null }))).toEqual({
      source: 'local',
    });
  });

  it('has nothing to save when the local source is already the saved one', () => {
    expect(isUnchangedLocal('local', 'qwen3:8b', settingsOf())).toBe(true);
    expect(isUnchangedLocal('local', 'qwen3:4b-instruct', settingsOf())).toBe(false);
    expect(isUnchangedLocal('local', 'qwen3:8b', savedHosted)).toBe(false);
    expect(isUnchangedLocal('hosted', null, settingsOf())).toBe(false);
  });
});
