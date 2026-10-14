import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ConditionOperator } from '../nodes/condition';
import type { InputValueType } from '../nodes/input';
import { createNode, type NodeDataMap, type NodeOfKind } from '../nodes/registry';
import type { TransformOperation } from '../nodes/transform';
import type { JsonValue } from '../persistence/json';
import { err, ok } from '../result';
import {
  type EvaluableNode,
  evaluateNode,
  type EvaluationErrorCode,
  type NodeValues,
} from './evaluate-node';

type EvaluableKind = EvaluableNode['kind'];

const ORIGIN = { x: 0, y: 0 };

function nodeOf<K extends EvaluableKind>(kind: K, data: NodeDataMap[K]): NodeOfKind<K> {
  return { id: 'node', kind, label: 'Node 1', position: ORIGIN, data };
}

const inputNode = (valueType: InputValueType, value: string) =>
  nodeOf('input', { valueType, value });
const promptNode = (template: string) => nodeOf('prompt', { template });
const transformNode = (operation: TransformOperation, path = '') =>
  nodeOf('transform', { operation, path });
const conditionNode = (operator: ConditionOperator, operand = '') =>
  nodeOf('condition', { operator, operand });
const OUTPUT = nodeOf('output', { format: 'text' });

function failure(code: EvaluationErrorCode, message: string) {
  return err({ code, message });
}

const NO_VALUE = failure('missing-input', 'Input "value" has no value');

// JSON texts that `JSON.parse` reads with `Infinity` in them, which is not a JSON value.
const TOO_LARGE = ['1e999', '[1e999]'];

// A value of each type that is not text, with how a message describes it.
const NOT_TEXT: [JsonValue, string][] = [
  [42, 'a number'],
  [true, 'a boolean'],
  [null, 'null'],
  [['a'], 'an array'],
  [{ text: 'a' }, 'an object'],
];

function notText(port: string, description: string) {
  return failure(
    'not-text',
    `Input "${port}" needs text but received ${description}; convert it with a Transform node`,
  );
}

describe('evaluateNode', () => {
  it('covers every node kind but LLM Call', () => {
    expectTypeOf<EvaluableKind>().toEqualTypeOf<
      'input' | 'prompt' | 'transform' | 'condition' | 'output'
    >();
  });

  describe('Input', () => {
    it('outputs text as it is', () => {
      expect(evaluateNode(inputNode('text', '  Why?\n'), {})).toEqual(ok({ value: '  Why?\n' }));
      expect(evaluateNode(inputNode('text', ''), {})).toEqual(ok({ value: '' }));
    });

    it.each([
      ['42', 42],
      [' -1.5e3 ', -1500],
      ['0', 0],
    ])('reads %j as a number', (value, number) => {
      expect(evaluateNode(inputNode('number', value), {})).toEqual(ok({ value: number }));
    });

    it.each(['abc', '12px', '', '   ', 'Infinity', '1e999'])('rejects %j as a number', (value) => {
      expect(evaluateNode(inputNode('number', value), {})).toEqual(
        failure('invalid-number', 'Value is not a number'),
      );
    });

    it('parses JSON', () => {
      expect(evaluateNode(inputNode('json', '{"user": {"name": "Ada"}, "tags": []}'), {})).toEqual(
        ok({ value: { user: { name: 'Ada' }, tags: [] } }),
      );
      expect(evaluateNode(inputNode('json', ' "text" '), {})).toEqual(ok({ value: 'text' }));
      expect(evaluateNode(inputNode('json', 'null'), {})).toEqual(ok({ value: null }));
    });

    it.each(['{name: "Ada"}', '[1, 2', 'text', '', ...TOO_LARGE])('rejects %j as JSON', (value) => {
      expect(evaluateNode(inputNode('json', value), {})).toEqual(
        failure('invalid-json', 'Value is not valid JSON'),
      );
    });

    it('ignores input values', () => {
      expect(evaluateNode(inputNode('text', 'own'), { value: 'other' })).toEqual(
        ok({ value: 'own' }),
      );
    });
  });

  describe('Prompt', () => {
    it('fills its template from its text inputs', () => {
      const node = promptNode('Translate {{text}} into {{ language }}: {{text}}');
      expect(evaluateNode(node, { text: 'hello', language: 'French' })).toEqual(
        ok({ prompt: 'Translate hello into French: hello' }),
      );
    });

    it('outputs a template without variables as it is', () => {
      expect(evaluateNode(promptNode('Say {hi} and {{ 1st }}'), {})).toEqual(
        ok({ prompt: 'Say {hi} and {{ 1st }}' }),
      );
    });

    it('fails when a variable has no value', () => {
      expect(evaluateNode(promptNode('{{a}} and {{b}}'), { a: 'x' })).toEqual(
        failure('missing-input', 'Input "b" has no value'),
      );
    });

    it.each(NOT_TEXT)('fails when a variable receives %j instead of text', (value, description) => {
      expect(evaluateNode(promptNode('Answer: {{question}}'), { question: value })).toEqual(
        notText('question', description),
      );
    });

    it('fills variables named like properties of every object', () => {
      const node = promptNode('{{constructor}} {{__proto__}}');
      const inputs = Object.fromEntries([
        ['constructor', 'a'],
        ['__proto__', 'b'],
      ]);
      expect(evaluateNode(node, inputs)).toEqual(ok({ prompt: 'a b' }));
      expect(evaluateNode(node, {})).toEqual(
        failure('missing-input', 'Input "constructor" has no value'),
      );
    });
  });

  describe('Transform', () => {
    it('parses JSON text', () => {
      expect(evaluateNode(transformNode('parse-json'), { value: '{"a": [1, "x"]}' })).toEqual(
        ok({ result: { a: [1, 'x'] } }),
      );
    });

    it.each(['Sure! {"a": 1}', ...TOO_LARGE])('fails to parse %j as JSON', (value) => {
      expect(evaluateNode(transformNode('parse-json'), { value })).toEqual(
        failure('invalid-json', 'Input "value" is not valid JSON'),
      );
    });

    it.each([
      [{ a: [1, 'x'], b: null }, '{"a":[1,"x"],"b":null}'],
      ['text', '"text"'],
      [42, '42'],
      [null, 'null'],
    ])('stringifies %j as compact JSON', (value, json) => {
      expect(evaluateNode(transformNode('stringify'), { value })).toEqual(ok({ result: json }));
    });

    it('trims text', () => {
      expect(evaluateNode(transformNode('trim'), { value: ' \n hi there \t' })).toEqual(
        ok({ result: 'hi there' }),
      );
    });

    it.each(['parse-json', 'trim'] as const)(
      '%s fails on a value that is not text',
      (operation) => {
        for (const [value, description] of NOT_TEXT) {
          expect(evaluateNode(transformNode(operation), { value })).toEqual(
            notText('value', description),
          );
        }
      },
    );

    it.each([
      [{ user: { name: 'Ada' } }, 'user.name', 'Ada'],
      [{ items: [{ id: 1 }, { id: 2 }] }, 'items.1.id', 2],
      [[10, 20], '0', 10],
      [{ user: { name: 'Ada' } }, 'user', { name: 'Ada' }],
      [{ empty: null }, 'empty', null],
      [{ '0': 'zero' }, '0', 'zero'],
      [Object.fromEntries([['__proto__', 'own']]), '__proto__', 'own'],
    ])('reads the field of %j at %j', (value, path, field) => {
      expect(evaluateNode(transformNode('get-field', path), { value })).toEqual(
        ok({ result: field }),
      );
    });

    it.each([
      [{ user: {} }, 'user.name', 'user.name'],
      [{ user: { name: 'Ada' } }, 'user.address.city', 'user.address'],
      [{ user: { name: 'Ada' } }, 'user.name.first', 'user.name.first'],
      [{ items: [1] }, 'items.1', 'items.1'],
      [{ items: [1, 2] }, 'items.01', 'items.01'],
      [{ items: [1] }, 'items.-1', 'items.-1'],
      [{ items: [1] }, 'items.length', 'items.length'],
      ['text', 'length', 'length'],
      [42, 'value', 'value'],
      [null, 'value', 'value'],
      [{}, 'constructor', 'constructor'],
    ])('fails to read the field of %j at %j', (value, path, missing) => {
      expect(evaluateNode(transformNode('get-field', path), { value })).toEqual(
        failure('missing-field', `Field "${missing}" does not exist`),
      );
    });

    it.each(['parse-json', 'stringify', 'trim', 'get-field'] as const)(
      '%s fails without an input value',
      (operation) => {
        expect(evaluateNode(transformNode(operation, 'a'), {})).toEqual(NO_VALUE);
      },
    );
  });

  describe('Condition', () => {
    /** Which output a value goes out of; the outputs must hold it unchanged on one port only. */
    function branchOf(operator: ConditionOperator, operand: string, value: JsonValue): string {
      const result = evaluateNode(conditionNode(operator, operand), { value });
      if (!result.ok) throw new Error(result.error.message);
      const ports = Object.keys(result.value);
      expect(ports).toHaveLength(1);
      expect(result.value[ports.join()]).toBe(value);
      return ports.join();
    }

    it('routes text that contains the operand to "true", and other text to "false"', () => {
      expect(branchOf('contains', 'yes', 'The answer is yes.')).toBe('true');
      expect(branchOf('contains', 'yes', 'The answer is no.')).toBe('false');
    });

    it('routes text equal to the operand to "true", and other text to "false"', () => {
      expect(branchOf('equals', 'yes', 'yes')).toBe('true');
      expect(branchOf('equals', 'yes', 'yes, sure')).toBe('false');
    });

    it('compares case-sensitively and without trimming', () => {
      expect(branchOf('contains', 'yes', 'Yes')).toBe('false');
      expect(branchOf('equals', 'yes', ' yes\n')).toBe('false');
    });

    it.each([
      [42, '42'],
      [true, 'true'],
      [null, 'null'],
      [{ a: 1 }, '{"a":1}'],
      [['red', 'green'], '["red","green"]'],
    ])('compares %j by its JSON text %j', (value, json) => {
      expect(branchOf('equals', json, value)).toBe('true');
    });

    it('looks for the operand in the JSON text of a value', () => {
      expect(branchOf('contains', '"green"', ['red', 'green'])).toBe('true');
      expect(branchOf('contains', '"a":', { a: 1 })).toBe('true');
      expect(branchOf('contains', 'blue', ['red', 'green'])).toBe('false');
    });

    it.each(['', '  \n\t', null, [], {}])('finds %j empty', (value) => {
      expect(branchOf('is-empty', 'ignored', value)).toBe('true');
    });

    it.each(['x', '[]', 0, false, [null], [''], { a: null }])('finds %j not empty', (value) => {
      expect(branchOf('is-empty', '', value)).toBe('false');
    });

    it('fails without an input value', () => {
      expect(evaluateNode(conditionNode('equals', 'x'), {})).toEqual(NO_VALUE);
    });
  });

  describe('Output', () => {
    it.each(['The answer', 42, null, { user: { name: 'Ada' } }])(
      'outputs %j as the value it shows',
      (value) => {
        expect(evaluateNode(OUTPUT, { value })).toStrictEqual(ok({ value }));
      },
    );

    it('fails without an input value', () => {
      expect(evaluateNode(OUTPUT, {})).toEqual(NO_VALUE);
    });
  });

  it('ignores values that are not inputs of the node', () => {
    const inputs: NodeValues = { value: 'shown', extra: 1, question: 'Why?' };
    expect(evaluateNode(OUTPUT, inputs)).toStrictEqual(ok({ value: 'shown' }));
  });

  it('throws on an LLM Call or on a variant it does not know', () => {
    const llm = createNode('llm-call', { id: 'llm', label: 'LLM Call 1', position: ORIGIN });
    // @ts-expect-error -- the engine streams LLM Call nodes, as only a type error would allow.
    expect(() => evaluateNode(llm, {})).toThrow('Unhandled variant');
    // @ts-expect-error -- a value type that does not exist, as only a type error would allow.
    const date = inputNode('date', '2026-10-14');
    expect(() => evaluateNode(date, {})).toThrow('Unhandled variant');
    // @ts-expect-error -- an operation that does not exist, as only a type error would allow.
    const uppercase = transformNode('uppercase');
    expect(() => evaluateNode(uppercase, { value: 'a' })).toThrow('Unhandled variant');
    // @ts-expect-error -- an operator that does not exist, as only a type error would allow.
    const matches = conditionNode('matches', 'a');
    expect(() => evaluateNode(matches, { value: 'a' })).toThrow('Unhandled variant');
  });
});
