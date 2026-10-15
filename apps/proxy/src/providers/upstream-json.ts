import type { JsonObject, JsonValue } from '@pipeline-builder/core';

/** The JSON object `text` holds, or undefined when it is not JSON or holds something else. */
export function parseJsonObject(text: string): JsonObject | undefined {
  let json: JsonValue;
  try {
    // `JSON.parse` is typed `any`, but it only ever returns JSON values.
    json = JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
  return isJsonObject(json) ? json : undefined;
}

/** The field `key` of `object` when it is an object, or undefined. */
export function objectField(object: JsonObject | undefined, key: string): JsonObject | undefined {
  const value = ownField(object, key);
  return isJsonObject(value) ? value : undefined;
}

/** The field `key` of `object` when it is a string, or undefined. */
export function stringField(object: JsonObject | undefined, key: string): string | undefined {
  const value = ownField(object, key);
  return typeof value === 'string' ? value : undefined;
}

// Own fields only: `constructor` or `__proto__` would otherwise come from the prototype.
function ownField(object: JsonObject | undefined, key: string): JsonValue | undefined {
  return object !== undefined && Object.hasOwn(object, key) ? object[key] : undefined;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
