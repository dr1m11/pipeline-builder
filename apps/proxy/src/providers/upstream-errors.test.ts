import { LlmError } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import {
  errorCodeForStatus,
  refusalError,
  tokenLimitError,
  upstreamError,
} from './upstream-errors';

describe('errorCodeForStatus', () => {
  it.each([
    [401, 'invalid-key'],
    [403, 'invalid-key'],
    [429, 'rate-limited'],
    [400, 'bad-request'],
    [402, 'bad-request'],
    [404, 'bad-request'],
    [413, 'bad-request'],
    [499, 'bad-request'],
    [500, 'upstream-error'],
    [503, 'upstream-error'],
    [504, 'upstream-error'],
    [529, 'upstream-error'],
    [302, 'upstream-error'],
  ] as const)('maps the status %d to %s', (status, code) => {
    expect(errorCodeForStatus(status)).toBe(code);
  });
});

describe('upstreamError', () => {
  it.each([
    [
      'invalid-key',
      'Acme rejected the API key (HTTP 401, auth_error). Check the key and try again.',
    ],
    [
      'rate-limited',
      'Acme is limiting requests with this API key (HTTP 401, auth_error). Wait a minute and try again.',
    ],
    [
      'bad-request',
      'Acme rejected the request (HTTP 401, auth_error). Check the model and Max tokens.',
    ],
    ['upstream-error', 'Acme failed to answer (HTTP 401, auth_error). Try again later.'],
  ] as const)('writes a fixed message for %s', (code, message) => {
    expect(upstreamError('Acme', code, { status: 401, type: 'auth_error' })).toEqual(
      new LlmError(code, message),
    );
  });

  it.each(['bad-request', 'rate-limited'] as const)(
    'points to billing for a %s that the account cannot pay for',
    (code) => {
      expect(
        upstreamError('Acme', code, { status: 402, type: 'billing_error', billing: true }),
      ).toEqual(
        new LlmError(
          code,
          'Acme refused the request because the account of this API key is out of credit or over a spending limit (HTTP 402, billing_error). Check its plan and billing.',
        ),
      );
    },
  );

  it('names only what it knows', () => {
    expect(upstreamError('Acme', 'upstream-error').message).toBe(
      'Acme failed to answer. Try again later.',
    );
    expect(upstreamError('Acme', 'upstream-error', { status: 502 }).message).toBe(
      'Acme failed to answer (HTTP 502). Try again later.',
    );
    expect(upstreamError('Acme', 'upstream-error', { type: 'overloaded_error' }).message).toBe(
      'Acme failed to answer (overloaded_error). Try again later.',
    );
  });

  it.each([
    ['a key', 'sk-ant-api03-abc'],
    ['spaces', 'model not found'],
    ['capitals', 'Overloaded'],
    ['digits', 'error_42'],
    ['a leading underscore', '_error'],
    ['a type longer than 64 characters', 'a'.repeat(65)],
  ])('leaves out an error type with %s', (_case, type) => {
    expect(upstreamError('Acme', 'upstream-error', { type }).message).toBe(
      'Acme failed to answer. Try again later.',
    );
  });
});

describe('refusalError', () => {
  it('says the provider declined the prompt', () => {
    expect(refusalError('Acme')).toEqual(
      new LlmError('bad-request', 'Acme declined to answer this prompt.'),
    );
  });
});

describe('tokenLimitError', () => {
  it('asks for more max tokens', () => {
    expect(tokenLimitError('Acme')).toEqual(
      new LlmError(
        'bad-request',
        'Acme used up Max tokens before writing an answer. Raise Max tokens and try again.',
      ),
    );
  });
});
