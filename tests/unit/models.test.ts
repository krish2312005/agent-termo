import { describe, it, expect } from 'vitest';
import { CURATED_MODELS, getProviderModelLimits, isChatModel, mergeModels } from '../../src/llm/models.js';
import { resolveContextBudget } from '../../src/runtime/context.js';

describe('NVIDIA NIM model limits', () => {
  it('uses provider-published limits for known models and no guessed limits for unknown models', () => {
    expect(getProviderModelLimits('stepfun-ai/step-3.7-flash')).toMatchObject({
      contextWindowTokens: 262_144,
      maxOutputTokens: 262_144,
    });
    expect(getProviderModelLimits('qwen/qwen2.5-coder-32b-instruct')).toMatchObject({
      contextWindowTokens: 32_768,
      maxOutputTokens: 4_000,
    });
    expect(getProviderModelLimits('deepseek-ai/deepseek-r1')).toMatchObject({
      contextWindowTokens: 131_072,
    });
    expect(getProviderModelLimits('nvidia/llama-3.1-nemotron-70b-instruct')).toMatchObject({
      contextWindowTokens: 131_072,
      maxOutputTokens: 4_096,
    });
  });

  it('reserves a 262K context window for nemotron-3.5-super-vl-120b-a12b', () => {
    const model = 'nvidia/nemotron-3.5-super-vl-120b-a12b';

    expect(getProviderModelLimits(model)?.contextWindowTokens).toBe(262_144);

    const budget = resolveContextBudget(model, {});
    expect(budget.contextWindowTokens).toBe(262_144);
    expect(budget.inputBudgetTokens).toBeGreaterThan(200_000);
  });
});

describe('isChatModel', () => {
  it('hides embedding, reranking and guard models', () => {
    expect(isChatModel('nvidia/nv-embedqa-e5-v5')).toBe(false);
    expect(isChatModel('nvidia/llama-3.2-nv-rerankqa-1b-v2')).toBe(false);
    expect(isChatModel('meta/llama-guard-4-12b')).toBe(false);
  });

  it('keeps chat models', () => {
    expect(isChatModel('meta/llama-3.1-70b-instruct')).toBe(true);
    expect(isChatModel('qwen/qwen2.5-coder-32b-instruct')).toBe(true);
  });
});

describe('mergeModels', () => {
  it('falls back to the curated list when the live catalogue is unavailable', () => {
    expect(mergeModels(null)).toEqual(CURATED_MODELS);
  });

  it('puts curated models first (in curated order) and drops ones NIM no longer serves', () => {
    const live = [
      'zzz/last-model',
      'meta/llama-3.3-70b-instruct',
      'stepfun-ai/step-3.7-flash',
      'aaa/first-model',
    ];
    const ids = mergeModels(live).map((m) => m.id);

    expect(ids).toEqual([
      'stepfun-ai/step-3.7-flash',
      'meta/llama-3.3-70b-instruct',
      'aaa/first-model',
      'zzz/last-model',
    ]);
  });

  it('keeps notes on curated entries and filters non-chat models from the rest', () => {
    const merged = mergeModels(['stepfun-ai/step-3.7-flash', 'nvidia/nv-embedqa-e5-v5', 'google/gemma-2-9b-it']);

    expect(merged.find((m) => m.id === 'stepfun-ai/step-3.7-flash')?.note).toBe('default');
    expect(merged.map((m) => m.id)).not.toContain('nvidia/nv-embedqa-e5-v5');
    expect(merged.map((m) => m.id)).toContain('google/gemma-2-9b-it');
  });

  it('does not duplicate a curated model that is also in the live list', () => {
    const ids = mergeModels(CURATED_MODELS.map((m) => m.id)).map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
