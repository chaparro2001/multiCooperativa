import { describe, expect, it } from 'vitest';

import { canChooseAssistantModel, modelHint, modelToSave } from './model-settings';

describe('assistant model section (US-AI-07)', () => {
  it('is visible only to whoever manages the users module', () => {
    expect(
      canChooseAssistantModel([
        { module: 'assistant', level: 'read' },
        { module: 'users', level: 'manage' },
      ]),
    ).toBe(true);
    expect(canChooseAssistantModel([{ module: 'users', level: 'read' }])).toBe(false);
    expect(canChooseAssistantModel([{ module: 'invoicing', level: 'manage' }])).toBe(false);
    expect(canChooseAssistantModel(undefined)).toBe(false);
  });

  it('knows the hints of the recommended models and nothing about the rest', () => {
    expect(modelHint('qwen3:8b')).toBe('accurate');
    expect(modelHint('qwen3:4b-instruct')).toBe('fast');
    expect(modelHint('llama3:70b')).toBeNull();
  });

  it('saves the server default as "no choice"', () => {
    const settings = { default: 'qwen3:8b' };
    expect(modelToSave('qwen3:8b', settings)).toBeNull();
    expect(modelToSave('qwen3:4b-instruct', settings)).toBe('qwen3:4b-instruct');
  });
});
