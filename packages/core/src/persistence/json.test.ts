import { describe, expect, it } from 'vitest';

import { isJsonArray, isJsonObject, type JsonValue, parseJson } from './json';

const VALUES: readonly (JsonValue | undefined)[] = ['text', 1, true, null, [], [1], {}, undefined];

describe('isJsonObject', () => {
  it('accepts objects only, not arrays, null, primitives or a missing value', () => {
    expect(VALUES.filter((value) => isJsonObject(value))).toEqual([{}]);
  });
});

describe('isJsonArray', () => {
  it('accepts arrays only', () => {
    expect(VALUES.filter((value) => isJsonArray(value))).toEqual([[], [1]]);
  });
});

describe('parseJson', () => {
  it('returns the value of a JSON text', () => {
    expect(parseJson(' {"a": [1, -2.5e3, "x", true, null]} ')).toEqual({
      a: [1, -2500, 'x', true, null],
    });
    expect(parseJson('"text"')).toBe('text');
    expect(parseJson('null')).toBeNull();
  });

  it.each(['', 'text', '{a: 1}', '[1,', '{"a": 1} extra'])('rejects %j as JSON', (text) => {
    expect(parseJson(text)).toBeUndefined();
  });

  it.each(['1e999', '-1e999', '[1e999]', '{"a": {"b": [0, -1e999]}}'])(
    'rejects %j, whose number is too large for a JSON value',
    (text) => {
      expect(parseJson(text)).toBeUndefined();
    },
  );
});
