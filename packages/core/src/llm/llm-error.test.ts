import { describe, expect, expectTypeOf, it } from 'vitest';

import { LLM_ERROR_CODES, LlmError, type LlmErrorCode } from './llm-error';

describe('LLM_ERROR_CODES', () => {
  it('lists every error code once', () => {
    expect(LLM_ERROR_CODES).toEqual([
      'bad-request',
      'invalid-key',
      'rate-limited',
      'upstream-error',
      'timeout',
      'network',
    ]);
    expectTypeOf<(typeof LLM_ERROR_CODES)[number]>().toEqualTypeOf<LlmErrorCode>();
  });
});

describe('LlmError', () => {
  it('is an Error with a code and a message', () => {
    const error = new LlmError('invalid-key', 'The API key was rejected.');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.name).toBe('LlmError');
    expect(error.code).toBe('invalid-key');
    expect(error.message).toBe('The API key was rejected.');
    expect(String(error)).toBe('LlmError: The API key was rejected.');
  });

  it('keeps the error that caused it', () => {
    const cause = new Error('socket hang up');

    expect(new LlmError('network', 'The proxy could not be reached.', { cause }).cause).toBe(cause);
  });
});
