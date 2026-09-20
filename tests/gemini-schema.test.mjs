import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * Gemini reads a documented subset of JSON Schema and treats anything else as
 * a bad request, so the conversion is tested directly: a schema that silently
 * loses a property, or keeps a keyword Gemini rejects, breaks every AI feature
 * for anyone using that provider.
 */
const { pruneForGemini, geminiResponseSchema } = await import('../.test-build/ai/json-schema.js');
const { CourseAnalysisSchema, GeneratedQuestionSchema } = await import(
  '../.test-build/ai/schemas.js'
);

test('unsupported keywords are dropped', () => {
  const out = pruneForGemini({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'string',
    minLength: 1,
    maxLength: 40,
    pattern: '^a',
    description: 'kept',
  });
  assert.deepEqual(out, { type: 'string', description: 'kept' });
});

test('supported keywords survive', () => {
  const input = {
    type: 'object',
    title: 'Thing',
    required: ['name'],
    additionalProperties: false,
    propertyOrdering: ['name'],
    properties: {
      name: { type: 'string', enum: ['a', 'b'] },
      list: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'number', minimum: 0, maximum: 1 } },
    },
  };
  assert.deepEqual(pruneForGemini(input), input);
});

test('a nullable field becomes a union rather than a type list', () => {
  const out = pruneForGemini({ type: ['string', 'null'], description: 'maybe' });
  assert.deepEqual(out, {
    anyOf: [{ type: 'string' }, { type: 'null' }],
    description: 'maybe',
  });
});

test('a property named like a keyword is not mistaken for one', () => {
  // GeneratedQuestionSchema really does have a property called "type", and
  // pruning it away would send the model a schema with no question type.
  const out = pruneForGemini({
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['multiple_choice'] },
      items: { type: 'string', minLength: 2 },
      pattern: { type: 'string' },
    },
  });
  assert.deepEqual(out.properties, {
    type: { type: 'string', enum: ['multiple_choice'] },
    items: { type: 'string' },
    pattern: { type: 'string' },
  });
});

test('nested subschemas are pruned too', () => {
  const out = pruneForGemini({
    type: 'array',
    items: { type: 'object', properties: { a: { type: 'string', minLength: 3 } } },
    anyOf: [{ type: 'string', pattern: 'x' }],
  });
  assert.deepEqual(out, {
    type: 'array',
    items: { type: 'object', properties: { a: { type: 'string' } } },
    anyOf: [{ type: 'string' }],
  });
});

test('the real contracts convert without losing their shape', () => {
  const analysis = geminiResponseSchema(CourseAnalysisSchema);
  assert.equal(analysis.type, 'object');
  assert.ok(analysis.properties.topics, 'topics survives');
  assert.ok(analysis.properties.detected_language.enum.includes('sq'));
  assert.ok(analysis.required.includes('topics'));

  const question = geminiResponseSchema(GeneratedQuestionSchema);
  assert.ok(question.properties.type.enum.includes('multiple_choice'));
  assert.ok(question.properties.source_type.enum.includes('ai_generated'));

  // Checked by walking the keywords rather than by searching the text: a
  // description legitimately mentions "previous_exam_patterns", and that is
  // not the `pattern` keyword.
  const SUPPORTED = new Set([
    '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum',
    'items', 'prefixItems', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf',
    'properties', 'additionalProperties', 'required', 'propertyOrdering',
  ]);

  const offenders = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) return node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (!SUPPORTED.has(key)) offenders.push(`${path}.${key}`);
      // Property and $defs names are free-form, so only their values are schemas.
      if (key === 'properties' || key === '$defs') {
        for (const [name, sub] of Object.entries(value)) walk(sub, `${path}.${key}.${name}`);
      } else if (key !== 'enum' && key !== 'required' && key !== 'propertyOrdering') {
        walk(value, `${path}.${key}`);
      }
    }
  };
  walk(analysis, 'analysis');
  walk(question, 'question');
  assert.deepEqual(offenders, []);
});
