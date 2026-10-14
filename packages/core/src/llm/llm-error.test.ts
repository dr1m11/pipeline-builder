import { describe, expect, expectTypeOf, it } from 'vitest';
import type * as z from 'zod';

import {
  LLM_ERROR_CODES,
  LLM_ERROR_RESPONSE_SCHEMA,
  LlmError,
  type LlmErrorCode,
  type LlmErrorResponse,
} from './llm-error';

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

describe('LLM_ERROR_RESPONSE_SCHEMA', () => {
  it('describes exactly the error response type', () => {
    expectTypeOf<LlmErrorResponse>().toExtend<z.output<typeof LLM_ERROR_RESPONSE_SCHEMA>>();
    expectTypeOf<z.output<typeof LLM_ERROR_RESPONSE_SCHEMA>>().toExtend<LlmErrorResponse>();
  });

  it.each(LLM_ERROR_CODES)('accepts an error with the code "%s"', (code) => {
    const response: LlmErrorResponse = { error: { code, message: 'Failed.' } };

    expect(LLM_ERROR_RESPONSE_SCHEMA.parse(response)).toEqual(response);
  });

  it('drops fields it does not know', () => {
    const body = {
      error: { code: 'rate-limited', message: 'Slow down.', retryAfter: 30 },
      ok: false,
    };

    expect(LLM_ERROR_RESPONSE_SCHEMA.parse(body)).toEqual({
      error: { code: 'rate-limited', message: 'Slow down.' },
    });
  });

  it.each([
    ['an unknown code', { error: { code: 'teapot', message: 'Failed.' } }],
    ['a missing message', { error: { code: 'timeout' } }],
    ['a message that is not text', { error: { code: 'timeout', message: 42 } }],
    ['an error that is only a message', { error: 'Failed.' }],
    ['no error', { message: 'Failed.' }],
    ['a body that is not an object', 'Failed.'],
  ])('rejects %s', (_, body) => {
    expect(LLM_ERROR_RESPONSE_SCHEMA.safeParse(body).success).toBe(false);
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
