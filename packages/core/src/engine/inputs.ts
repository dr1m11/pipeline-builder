// Reading the input values of a node, shared by `evaluateNode` and the run engine (LLM Call
// `prompt` and `system`), so every kind reports a missing or mistyped input in the same words.
// Internal to the engine: not exported from the package.
import { isJsonArray, type JsonValue } from '../persistence/json';
import { err, ok, type Result } from '../result';
import type { NodeEvaluationError, NodeValues } from './evaluate-node';

/**
 * The value of an input by port id, or a `missing-input` error when it has none. Only own keys
 * count, so a `constructor` port does not pick up `Object.prototype.constructor`.
 */
export function readInput(
  inputs: NodeValues,
  portId: string,
): Result<JsonValue, NodeEvaluationError> {
  const value = Object.hasOwn(inputs, portId) ? inputs[portId] : undefined;
  return value === undefined
    ? err({ code: 'missing-input', message: `Input "${portId}" has no value` })
    : ok(value);
}

/**
 * The value of a text input by port id. Another type of value can arrive through an `any` port;
 * it is a `not-text` error rather than converted (ADR 0005). A missing value is `missing-input`.
 */
export function readText(inputs: NodeValues, portId: string): Result<string, NodeEvaluationError> {
  const value = readInput(inputs, portId);
  if (!value.ok) return value;
  if (typeof value.value === 'string') return ok(value.value);
  const received = describeType(value.value);
  return err({
    code: 'not-text',
    message: `Input "${portId}" needs text but received ${received}; convert it with a Transform node`,
  });
}

function describeType(value: Exclude<JsonValue, string>): string {
  if (value === null) return 'null';
  if (isJsonArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object';
  return typeof value === 'number' ? 'a number' : 'a boolean';
}
