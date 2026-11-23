import { describe, expect, it } from 'vitest';
import { filteredPicker, nextPickerIndex, type PickItem } from '../../src/ui/tui.js';

const groupedItems: PickItem[] = [
  { value: 'openai', label: 'OpenAI', hint: 'gpt-6.2-astra', group: 'Connected' },
  { value: 'nvidia', label: 'NVIDIA NIM', hint: 'stepfun-ai/step-3.7-flash', group: 'Connected' },
  { value: 'openrouter', label: 'OpenRouter', hint: 'Claude, GPT, Gemini and many more', group: 'Not connected' },
  { value: 'deepseek', label: 'DeepSeek', hint: 'DeepSeek chat and reasoning models', group: 'Not connected' },
];

const labels = (items: PickItem[]): string[] => items.map((item) => item.label);
const headerLabels = (items: PickItem[]): string[] => items.filter((item) => item.header).map((item) => item.label);

describe('filteredPicker grouping', () => {
  it('inserts non-selectable headers before grouped sections', () => {
    const rows = filteredPicker('', groupedItems);

    expect(labels(rows)).toEqual(['Connected', 'OpenAI', 'NVIDIA NIM', 'Not connected', 'OpenRouter', 'DeepSeek']);
    expect(headerLabels(rows)).toEqual(['Connected', 'Not connected']);
    expect(rows[0]).toMatchObject({ value: '', label: 'Connected', header: true });
    expect(rows[3]).toMatchObject({ value: '', label: 'Not connected', header: true });
  });

  it('leaves ungrouped item lists unchanged for other pick callers', () => {
    const items: PickItem[] = [
      { value: 'model-a', label: 'Model A' },
      { value: 'model-b', label: 'Model B', hint: 'second choice' },
    ];

    const rows = filteredPicker('', items);

    expect(rows).toEqual(items);
    expect(rows.some((item) => item.header)).toBe(false);
  });

  it('filters grouped items without leaving orphan headers', () => {
    expect(labels(filteredPicker('nvidia', groupedItems))).toEqual(['Connected', 'NVIDIA NIM']);
    expect(headerLabels(filteredPicker('nvidia', groupedItems))).toEqual(['Connected']);

    expect(labels(filteredPicker('deep', groupedItems))).toEqual(['Not connected', 'DeepSeek']);
    expect(headerLabels(filteredPicker('deep', groupedItems))).toEqual(['Not connected']);

    expect(labels(filteredPicker('gpt', groupedItems))).toEqual(['Connected', 'OpenAI', 'Not connected', 'OpenRouter']);
    expect(headerLabels(filteredPicker('gpt', groupedItems))).toEqual(['Connected', 'Not connected']);

    expect(filteredPicker('no-such-provider', groupedItems)).toEqual([]);
  });

  it('appends a typed item for ungrouped allowCustom pickers', () => {
    const models: PickItem[] = [{ value: 'model-a', label: 'model-a', hint: 'first choice' }];

    const typed = filteredPicker('model-b', models, true);
    expect(typed).toHaveLength(1);
    expect(typed[0]).toMatchObject({ value: 'model-b', label: 'model-b', hint: 'use as typed' });

    expect(filteredPicker('model-a', models, true)).toEqual([models[0]]);
    expect(filteredPicker('', models, true)).toEqual(models);
  });
});

describe('nextPickerIndex', () => {
  it('skips headers in both directions', () => {
    const rows = filteredPicker('', groupedItems);
    // 0 header · 1 OpenAI · 2 NVIDIA · 3 header · 4 OpenRouter · 5 DeepSeek
    expect(nextPickerIndex(rows, -1, 1)).toBe(1);
    expect(nextPickerIndex(rows, 1, 1)).toBe(2);
    expect(nextPickerIndex(rows, 2, 1)).toBe(4);
    expect(nextPickerIndex(rows, 4, 1)).toBe(5);
    expect(nextPickerIndex(rows, 5, -1)).toBe(4);
    expect(nextPickerIndex(rows, 4, -1)).toBe(2);
    expect(nextPickerIndex(rows, 2, -1)).toBe(1);
  });

  it('returns the current index when no further selectable row exists', () => {
    const rows = filteredPicker('', groupedItems);

    expect(nextPickerIndex(rows, 5, 1)).toBe(5);
    expect(nextPickerIndex(rows, 1, -1)).toBe(1);

    const headersOnly: PickItem[] = [
      { value: '', label: 'Connected', header: true },
      { value: '', label: 'Not connected', header: true },
    ];
    expect(nextPickerIndex(headersOnly, -1, 1)).toBe(-1);
    expect(nextPickerIndex(headersOnly, -1, -1)).toBe(-1);
  });
});
