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
