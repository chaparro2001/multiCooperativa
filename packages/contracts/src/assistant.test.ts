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
      }).success,
    ).toBe(true);
  });
});
