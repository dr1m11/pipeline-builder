import { describe, expect, it } from 'vitest';

import { isJsonArray, isJsonObject, type JsonValue } from './json';

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
