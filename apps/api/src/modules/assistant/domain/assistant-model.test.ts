import { describe, expect, it } from 'vitest';

import { effectiveModel, isSelectable, offeredModels } from './assistant-model';

const ALLOWED = ['qwen3:8b', 'qwen3:4b-instruct'];

describe('offeredModels (BR-AI-09)', () => {
  it('offers only allowlisted models that are installed', () => {
    expect(offeredModels(ALLOWED, ['qwen3:8b', 'llama3:70b', 'bge-m3'])).toEqual(['qwen3:8b']);
  });

  it('never offers an installed model that is not allowlisted', () => {
    expect(offeredModels(['qwen3:8b'], ['qwen3:8b', 'qwen3:4b-instruct'])).toEqual(['qwen3:8b']);
  });

  it('offers nothing when none of the allowlisted models is installed', () => {
    expect(offeredModels(ALLOWED, [])).toEqual([]);
  });

  it('trusts the allowlist when Ollama cannot be asked', () => {
    expect(offeredModels(ALLOWED, null)).toEqual(ALLOWED);
  });
});

describe('effectiveModel (BR-AI-09)', () => {
  it('uses the saved model while it is offered', () => {
    expect(effectiveModel('qwen3:4b-instruct', 'qwen3:8b', ALLOWED)).toBe('qwen3:4b-instruct');
  });

  it('falls back to the default when the saved model is no longer offered', () => {
    expect(effectiveModel('qwen3:4b-instruct', 'qwen3:8b', ['qwen3:8b'])).toBe('qwen3:8b');
  });

  it('uses the default when nothing was saved', () => {
    expect(effectiveModel(null, 'qwen3:8b', ALLOWED)).toBe('qwen3:8b');
  });
});

describe('isSelectable', () => {
  it('accepts an offered model and the reset to default', () => {
    expect(isSelectable('qwen3:8b', ALLOWED)).toBe(true);
    expect(isSelectable(null, ALLOWED)).toBe(true);
  });

  it('rejects a model that is not offered', () => {
    expect(isSelectable('llama3:70b', ALLOWED)).toBe(false);
  });
});
