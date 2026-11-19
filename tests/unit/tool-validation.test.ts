import { describe, expect, it } from 'vitest';
import { validateJsonSchema } from '../../src/runtime/tool-validation.js';

describe('validateJsonSchema', () => {
  const schema = {
    type: 'object',
    required: ['path'],
    properties: {
      path: { type: 'string', minLength: 1 },
      offset: { type: 'integer', minimum: 0 },
      filters: { type: 'array', items: { type: 'string' } },
    },
  };

  it('accepts valid nested tool arguments', () => {
    expect(validateJsonSchema(schema, { path: 'src/main.ts', offset: 0, filters: ['ts', 'tsx'] })).toBeUndefined();
  });

  it('rejects missing required parameters and invalid primitive values', () => {
    expect(validateJsonSchema(schema, { offset: -1 })).toContain('path is required');
    expect(validateJsonSchema(schema, { path: '', offset: 0 })).toContain('at least 1 characters');
    expect(validateJsonSchema(schema, { path: 'a', offset: 1.5 })).toContain('integer');
  });

  it('rejects unsupported array element types and additional fields when prohibited', () => {
    expect(validateJsonSchema(schema, { path: 'a', filters: [1] })).toContain('filters[0]');
    expect(validateJsonSchema({ type: 'object', additionalProperties: false, properties: {} }, { shell: 'bash' })).toContain('not allowed');
  });
});
