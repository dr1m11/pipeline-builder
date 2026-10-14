import { describe, expect, it } from 'vitest';

import type { JsonValue } from '../persistence/json';
import { err, ok } from '../result';
import { readInput, readText } from './inputs';

describe('readInput', () => {
  it.each<JsonValue>(['text', '', 0, false, null, [], {}])('returns the value %j', (value) => {
    expect(readInput({ prompt: value }, 'prompt')).toEqual(ok(value));
  });

  it('fails when the input has no value', () => {
    expect(readInput({ system: 'Be brief.' }, 'prompt')).toEqual(
      err({ code: 'missing-input', message: 'Input "prompt" has no value' }),
    );
  });

  it('reads own keys only', () => {
    expect(readInput({}, 'constructor')).toEqual(
      err({ code: 'missing-input', message: 'Input "constructor" has no value' }),
    );
    expect(readInput(Object.fromEntries([['__proto__', 'own']]), '__proto__')).toEqual(ok('own'));
  });
});

describe('readText', () => {
  it('returns text, empty text included', () => {
    expect(readText({ system: 'Be brief.' }, 'system')).toEqual(ok('Be brief.'));
    expect(readText({ system: '' }, 'system')).toEqual(ok(''));
  });

  it.each<[JsonValue, string]>([
    [42, 'a number'],
    [true, 'a boolean'],
    [null, 'null'],
    [['a'], 'an array'],
    [{ text: 'a' }, 'an object'],
  ])('fails on %j, naming its type', (value, received) => {
    expect(readText({ prompt: value }, 'prompt')).toEqual(
      err({
        code: 'not-text',
        message: `Input "prompt" needs text but received ${received}; convert it with a Transform node`,
      }),
    );
  });

  it('fails when the input has no value', () => {
    expect(readText({}, 'system')).toEqual(
      err({ code: 'missing-input', message: 'Input "system" has no value' }),
    );
  });
});
