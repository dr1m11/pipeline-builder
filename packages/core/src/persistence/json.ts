/** A value `JSON.parse` can return. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

/** A JSON object whose fields have not been checked yet. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

// The guards take `undefined` too, so a migration can test a field that may be absent.

/** Whether a JSON value is an object (not an array or `null`). */
export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a JSON value is an array. Unlike `Array.isArray`, it keeps the items typed. */
export function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

/**
 * The value of a JSON text, or `undefined` when the text is not valid JSON. A number too large for
 * a JSON value (`1e999`, which `JSON.parse` reads as `Infinity`) makes the text invalid too.
 */
export function parseJson(text: string): JsonValue | undefined {
  try {
    // `JSON.parse` is typed `any`, but it only returns JSON values once the reviver has thrown on
    // `Infinity` and `-Infinity`.
    return JSON.parse(text, rejectNonFinite) as JsonValue;
  } catch {
    return undefined;
  }
}

function rejectNonFinite(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new RangeError('A JSON number must be finite');
  }
  return value;
}
