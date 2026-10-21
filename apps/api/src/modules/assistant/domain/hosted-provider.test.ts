import { describe, expect, it } from 'vitest';

import {
  apiKeyHint,
  describeChoice,
  findHostedProvider,
  HOSTED_PROVIDERS,
  isModelListed,
  isValidApiKey,
  isValidHostedModelId,
} from './hosted-provider';

describe('hosted provider catalog (US-AI-07, ADR-019)', () => {
  it('is a fixed list of HTTPS base URLs, one per provider', () => {
    expect(HOSTED_PROVIDERS.map((provider) => provider.id)).toEqual([
      'groq',
      'mistral',
      'nvidia',
      'openrouter',
    ]);
    for (const provider of HOSTED_PROVIDERS) {
      expect(provider.baseUrl).toMatch(/^https:\/\/[a-z.]+\/.+/);
    }
    expect(findHostedProvider('groq')?.baseUrl).toBe('https://api.groq.com/openai/v1');
  });

  it('knows nothing about anything outside the catalog (no free base URL)', () => {
    expect(findHostedProvider('https://evil.test')).toBeNull();
    expect(findHostedProvider('')).toBeNull();
  });

  it('accepts any model id that is non-empty, bounded and without whitespace', () => {
    expect(isValidHostedModelId('openai/gpt-oss-20b:free')).toBe(true);
    expect(isValidHostedModelId('')).toBe(false);
    expect(isValidHostedModelId('a b')).toBe(false);
    expect(isValidHostedModelId('a\tb')).toBe(false);
    expect(isValidHostedModelId('a'.repeat(201))).toBe(false);
    expect(isValidHostedModelId('a'.repeat(200))).toBe(true);
  });

  it('validates the shape of an API key and exposes only its last four characters', () => {
    expect(isValidApiKey('gsk_0123456789')).toBe(true);
    expect(isValidApiKey('short')).toBe(false);
    expect(isValidApiKey('has space inside')).toBe(false);
    expect(apiKeyHint('gsk_0123456789abcd')).toBe('abcd');
  });

  it('describes a choice for the audit log without any key', () => {
    expect(
      describeChoice({ source: 'hosted', provider: 'groq', model: 'openai/gpt-oss-20b' }),
    ).toBe('hosted:groq/openai/gpt-oss-20b');
    expect(describeChoice({ source: 'local', model: 'qwen3:8b' })).toBe('local:qwen3:8b');
    expect(describeChoice({ source: 'local', model: null })).toBe('local:default');
  });

  it('requires the model to be listed by the provider', () => {
    expect(isModelListed(['a', 'b'], 'b')).toBe(true);
    expect(isModelListed(['a', 'b'], 'c')).toBe(false);
  });
});
