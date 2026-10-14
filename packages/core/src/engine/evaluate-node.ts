import { assertNever } from '../assert-never';
import type { ConditionNodeData, ConditionOperator } from '../nodes/condition';
import { isBlank } from '../nodes/field-rules';
import type { InputNodeData } from '../nodes/input';
import type { NodeOfKind, PipelineNode } from '../nodes/registry';
import type { TransformNodeData } from '../nodes/transform';
import { isJsonArray, isJsonObject, type JsonValue } from '../persistence/json';
import { err, ok, type Result } from '../result';
import { extractTemplateVariables, renderTemplate } from '../template';

/** Values by port id: the inputs of a node by input port id, or its outputs by output port id. */
export type NodeValues = Readonly<Record<string, JsonValue>>;

/** Why a node could not compute its outputs. */
export type EvaluationErrorCode =
  /** An input of the node has no value. */
  | 'missing-input'
  /** A text input received another type of value (through an `any` port). */
  | 'not-text'
  /** An Input node's value is not a number. */
  | 'invalid-number'
  /** An Input node's value or a `parse-json` input is not valid JSON. */
  | 'invalid-json'
  /** The `get-field` path leads to no value. */
  | 'missing-field';

/** A node that could not compute its outputs. */
export interface NodeEvaluationError {
  readonly code: EvaluationErrorCode;
  /** English description; it never names the node, so the UI can put the node label in front. */
  readonly message: string;
}

/**
 * A node `evaluateNode` computes: every kind but LLM Call, whose response the engine streams from
 * a provider instead.
 */
export type EvaluableNode = Exclude<PipelineNode, NodeOfKind<'llm-call'>>;

type Evaluation = Result<NodeValues, NodeEvaluationError>;

/**
 * Computes the outputs of a node, by output port id, from its data and its input values:
 *
 * - Input: `value`, read by `valueType`: text as it is, a number, or parsed JSON.
 * - Prompt: `prompt`, the template filled from the text inputs named after its variables.
 * - Transform: `result` of the operation. `parse-json` parses text; `stringify` writes any value as
 *   compact JSON (a string becomes a quoted JSON string); `trim` trims text; `get-field` follows a
 *   dot path through object fields and array indexes (`items.0.name`).
 * - Condition: the value, unchanged, on the `true` or the `false` output only. `contains` and
 *   `equals` compare the text form of the value (a string as it is, anything else as compact JSON)
 *   with the operand, case-sensitively and without trimming; `is-empty` holds for blank text,
 *   `null`, `[]` and `{}`.
 * - Output: `value`, the input as it is: the result the node shows.
 *
 * Text inputs (Prompt variables, `parse-json`, `trim`) accept only strings: another type of value
 * can arrive through an `any` port, and it is an error rather than converted (ADR 0005). An input
 * without a value is an error as well; the engine skips such a node instead of evaluating it.
 * Values that are not inputs of the node are ignored.
 */
export function evaluateNode(
  node: EvaluableNode,
  inputs: NodeValues,
): Result<NodeValues, NodeEvaluationError> {
  switch (node.kind) {
    case 'input':
      return evaluateInput(node.data);
    case 'prompt':
      return evaluatePrompt(node.data.template, inputs);
    case 'transform':
      return evaluateTransform(node.data, inputs);
    case 'condition':
      return evaluateCondition(node.data, inputs);
    case 'output': {
      const value = readInput(inputs, 'value');
      return value.ok ? ok({ value: value.value }) : value;
    }
    default:
      return assertNever(node);
  }
}

function evaluateInput({ valueType, value }: InputNodeData): Evaluation {
  switch (valueType) {
    case 'text':
      return ok({ value });
    case 'number': {
      // `Number` reads blank text as 0; like the Value field's rule, a blank value is not a number.
      const number = Number(value);
      return isBlank(value) || !Number.isFinite(number)
        ? err({ code: 'invalid-number', message: 'Value is not a number' })
        : ok({ value: number });
    }
    case 'json': {
      const parsed = parseJson(value);
      return parsed === undefined
        ? err({ code: 'invalid-json', message: 'Value is not valid JSON' })
        : ok({ value: parsed });
    }
    default:
      return assertNever(valueType);
  }
}

function evaluatePrompt(template: string, inputs: NodeValues): Evaluation {
  const values: [string, string][] = [];
  for (const name of extractTemplateVariables(template)) {
    const text = readText(inputs, name);
    if (!text.ok) return text;
    values.push([name, text.value]);
  }
  // `fromEntries` defines own properties, so a `{{__proto__}}` variable is filled like any other.
  return ok({ prompt: renderTemplate(template, Object.fromEntries(values)) });
}

function evaluateTransform({ operation, path }: TransformNodeData, inputs: NodeValues): Evaluation {
  switch (operation) {
    case 'parse-json': {
      const text = readText(inputs, 'value');
      if (!text.ok) return text;
      const parsed = parseJson(text.value);
      return parsed === undefined
        ? err({ code: 'invalid-json', message: 'Input "value" is not valid JSON' })
        : ok({ result: parsed });
    }
    case 'stringify': {
      const value = readInput(inputs, 'value');
      return value.ok ? ok({ result: JSON.stringify(value.value) }) : value;
    }
    case 'trim': {
      const text = readText(inputs, 'value');
      return text.ok ? ok({ result: text.value.trim() }) : text;
    }
    case 'get-field': {
      const value = readInput(inputs, 'value');
      if (!value.ok) return value;
      const field = getField(value.value, path);
      return field.ok ? ok({ result: field.value }) : field;
    }
    default:
      return assertNever(operation);
  }
}

function evaluateCondition(
  { operator, operand }: ConditionNodeData,
  inputs: NodeValues,
): Evaluation {
  const value = readInput(inputs, 'value');
  if (!value.ok) return value;
  const branch = holds(operator, operand, value.value) ? 'true' : 'false';
  return ok({ [branch]: value.value });
}

function holds(operator: ConditionOperator, operand: string, value: JsonValue): boolean {
  switch (operator) {
    case 'contains':
      return textForm(value).includes(operand);
    case 'equals':
      return textForm(value) === operand;
    case 'is-empty':
      return isEmpty(value);
    default:
      return assertNever(operator);
  }
}

/** A string as it is, any other value as compact JSON. */
function textForm(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Blank text, `null`, `[]` or `{}`. Numbers and booleans are never empty. */
function isEmpty(value: JsonValue): boolean {
  if (typeof value === 'string') return isBlank(value);
  if (value === null) return true;
  // The keys of an array are its indexes, so this covers `[]` and `{}`.
  return typeof value === 'object' && Object.keys(value).length === 0;
}

// A canonical array index: `0`, `12`, but not `01`, `-1` or `1.5`.
const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/;

/** The value at a dot path (`user.name`, `items.0`): object fields and array indexes. */
function getField(value: JsonValue, path: string): Result<JsonValue, NodeEvaluationError> {
  const names = path.split('.');
  let current = value;
  for (const [index, name] of names.entries()) {
    const next = childOf(current, name);
    if (next === undefined) {
      const missing = names.slice(0, index + 1).join('.');
      return err({ code: 'missing-field', message: `Field "${missing}" does not exist` });
    }
    current = next;
  }
  return ok(current);
}

function childOf(value: JsonValue, name: string): JsonValue | undefined {
  if (isJsonArray(value)) return ARRAY_INDEX.test(name) ? value[Number(name)] : undefined;
  // Own fields only, so `constructor` or `toString` are not found on every object.
  if (isJsonObject(value)) return Object.hasOwn(value, name) ? value[name] : undefined;
  return undefined;
}

function readInput(inputs: NodeValues, portId: string): Result<JsonValue, NodeEvaluationError> {
  const value = Object.hasOwn(inputs, portId) ? inputs[portId] : undefined;
  return value === undefined
    ? err({ code: 'missing-input', message: `Input "${portId}" has no value` })
    : ok(value);
}

function readText(inputs: NodeValues, portId: string): Result<string, NodeEvaluationError> {
  const value = readInput(inputs, portId);
  if (!value.ok) return value;
  if (typeof value.value === 'string') return ok(value.value);
  const received = describeType(value.value);
  return err({
    code: 'not-text',
    message: `Input "${portId}" needs text but received ${received}; convert it with a Transform node`,
  });
}

function describeType(value: JsonValue): string {
  if (value === null) return 'null';
  if (isJsonArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object';
  return typeof value === 'number' ? 'a number' : 'a boolean';
}

/** The value of a JSON text, or `undefined` when the text is not valid JSON. */
function parseJson(text: string): JsonValue | undefined {
  try {
    // `JSON.parse` is typed `any`, but it only ever returns JSON values.
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}
