type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
};

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array': return Array.isArray(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: return true;
  }
}

/** Validate JSON values before a tool is allowed to perform side effects. */
export function validateJsonSchema(schemaValue: unknown, value: unknown, path = 'arguments'): string | undefined {
  if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) return undefined;
  const schema = schemaValue as JsonSchema;
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length > 0 && !types.some((type) => matchesType(value, type))) {
    return `${path} must be ${types.join(' or ')}`;
  }
  if (schema.enum && !schema.enum.some((entry) => entry === value)) {
    return `${path} must be one of the allowed values`;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) return `${path} must contain at least ${schema.minLength} characters`;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return `${path} must contain at most ${schema.maxLength} characters`;
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return `${path} must be at least ${schema.minimum}`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${path} must be at most ${schema.maximum}`;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return `${path} must contain at least ${schema.minItems} items`;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${path} must contain at most ${schema.maxItems} items`;
    if (schema.items) {
      for (let index = 0; index < value.length; index++) {
        const error = validateJsonSchema(schema.items, value[index], `${path}[${index}]`);
        if (error) return error;
      }
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (object[key] === undefined) return `${path}.${key} is required`;
    }
    for (const [key, child] of Object.entries(object)) {
      const propertySchema = schema.properties?.[key];
      if (!propertySchema) {
        if (schema.additionalProperties === false) return `${path}.${key} is not allowed`;
        continue;
      }
      const error = validateJsonSchema(propertySchema, child, `${path}.${key}`);
      if (error) return error;
    }
  }
  return undefined;
}
