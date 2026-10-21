import { describe, expect, it } from 'vitest';

import { assistantModelSettingsSchema, updateAssistantModelBodySchema } from './assistant';

describe('assistant model contracts (US-AI-07)', () => {
  it('accepts a model id or null (back to the default) and nothing else', () => {
    expect(updateAssistantModelBodySchema.safeParse({ model: 'qwen3:8b' }).success).toBe(true);
    expect(updateAssistantModelBodySchema.safeParse({ model: null }).success).toBe(true);
    expect(updateAssistantModelBodySchema.safeParse({}).success).toBe(false);
    expect(updateAssistantModelBodySchema.safeParse({ model: '  ' }).success).toBe(false);
    expect(updateAssistantModelBodySchema.safeParse({ model: 'a', extra: 1 }).success).toBe(false);
  });

  it('describes the Gemini case with nothing to choose', () => {
    expect(
      assistantModelSettingsSchema.safeParse({
        provider: 'gemini',
        current: null,
        default: null,
        options: [],
        source: 'local',
        hostedAvailable: false,
        hosted: null,
        providers: [],
      }).success,
    ).toBe(true);
  });

  it('accepts a hosted provider with its own key, and the switch back to local', () => {
    const hosted = { source: 'hosted', provider: 'groq', model: 'openai/gpt-oss-20b' };
    expect(updateAssistantModelBodySchema.safeParse(hosted).success).toBe(true);
    expect(
      updateAssistantModelBodySchema.safeParse({ ...hosted, apiKey: 'gsk_0123456789' }).success,
    ).toBe(true);
    expect(updateAssistantModelBodySchema.safeParse({ source: 'local' }).success).toBe(true);
  });

  it('rejects unknown providers (no free base URL), spaces in the model and extra fields', () => {
    const hosted = { source: 'hosted', provider: 'groq', model: 'a/b' };
    expect(
      updateAssistantModelBodySchema.safeParse({ ...hosted, provider: 'https://evil.test' })
        .success,
    ).toBe(false);
    expect(updateAssistantModelBodySchema.safeParse({ ...hosted, model: 'a b' }).success).toBe(
      false,
    );
    expect(updateAssistantModelBodySchema.safeParse({ ...hosted, baseUrl: 'x' }).success).toBe(
      false,
    );
    expect(
      updateAssistantModelBodySchema.safeParse({ ...hosted, apiKey: 'a b c d e f g' }).success,
    ).toBe(false);
  });
});
