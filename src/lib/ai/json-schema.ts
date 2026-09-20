import type { ZodType } from 'zod';
import { toJSONSchema } from 'zod';

/**
 * Converts one of the app's zod contracts into the JSON Schema subset the
 * Gemini API accepts as a response schema.
 *
 * Gemini documents exactly which JSON Schema keywords it reads; anything else
 * in the document is a request error rather than a hint it ignores. zod emits
 * more than that — `$schema`, string lengths, union types written as a type
 * array — so the document is pruned here.
 *
 * Dropping a constraint from the request never loosens what the app accepts:
 * the response is still parsed with the full zod schema, so a string that is
 * too long or a missing field is rejected exactly as before. The schema sent
 * to the model is a hint; the zod parse is the gate.
 */

const SUPPORTED = new Set([
  '$id',
  '$defs',
  '$ref',
  '$anchor',
  'type',
  'format',
  'title',
  'description',
  'enum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'properties',
  'additionalProperties',
  'required',
  'propertyOrdering',
]);

/** Keys whose value is itself a schema. */
const SUBSCHEMA = new Set(['items', 'additionalProperties']);
/** Keys whose value is a list of schemas. */
const SUBSCHEMA_LIST = new Set(['anyOf', 'oneOf', 'prefixItems']);
/** Keys whose value is a map of name → schema, where the names are not keywords. */
const SUBSCHEMA_MAP = new Set(['properties', '$defs']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function pruneForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(pruneForGemini);
  if (!isObject(node)) return node;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node)) {
    if (!SUPPORTED.has(key)) continue;

    if (key === 'type' && Array.isArray(value)) {
      // `type: ['string', 'null']` is how zod writes a nullable field. Gemini
      // reads a single type, so the same meaning is expressed as a union.
      out.anyOf = value.map((entry) => ({ type: entry }));
      continue;
    }

    if (SUBSCHEMA_MAP.has(key) && isObject(value)) {
      const mapped: Record<string, unknown> = {};
      for (const [name, sub] of Object.entries(value)) mapped[name] = pruneForGemini(sub);
      out[key] = mapped;
      continue;
    }

    if (SUBSCHEMA_LIST.has(key) && Array.isArray(value)) {
      out[key] = value.map(pruneForGemini);
      continue;
    }

    if (SUBSCHEMA.has(key)) {
      out[key] = isObject(value) ? pruneForGemini(value) : value;
      continue;
    }

    // enum and required are lists of literals, not schemas.
    out[key] = value;
  }

  return out;
}

export function geminiResponseSchema(schema: ZodType): unknown {
  return pruneForGemini(toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }));
}
