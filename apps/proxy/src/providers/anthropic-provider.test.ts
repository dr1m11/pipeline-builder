import { LlmError, type LlmRequest } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import {
  ANTHROPIC_MESSAGES_URL,
  ANTHROPIC_VERSION,
  createAnthropicProvider,
} from './anthropic-provider';
import {
  ANTHROPIC_ANSWER,
  ANTHROPIC_MAX_TOKENS_AFTER_TEXT,
  ANTHROPIC_MAX_TOKENS_WHILE_THINKING,
  ANTHROPIC_OVERLOADED_MIDWAY,
  ANTHROPIC_REFUSAL,
} from './fixtures/anthropic-streams';
import { errorEvent, runProvider, TEST_API_KEY } from './fixtures/fake-upstream';

const WITHOUT_SYSTEM: LlmRequest = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  prompt: 'Why is the sky blue?',
  temperature: 0.7,
  maxTokens: 512,
};

const REQUEST: LlmRequest = { ...WITHOUT_SYSTEM, system: 'Answer in one sentence.' };

function run(body: string, request: LlmRequest = REQUEST) {
  return runProvider(createAnthropicProvider, body, request);
}

describe('createAnthropicProvider', () => {
  describe('the request', () => {
    it('streams a Messages API request with the version and the key in its headers', async () => {
      const { call } = await run(ANTHROPIC_ANSWER);

      expect(call.url).toBe('https://api.anthropic.com/v1/messages');
      expect(ANTHROPIC_MESSAGES_URL).toBe(call.url);
      expect(call.init.method).toBe('POST');
      expect(Object.fromEntries(new Headers(call.init.headers))).toEqual({
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': TEST_API_KEY,
      });
      expect(ANTHROPIC_VERSION).toBe('2023-06-01');
    });

    it('sends the prompt as the user message, the system prompt, max tokens and low effort', async () => {
      const { sentBody } = await run(ANTHROPIC_ANSWER);

      expect(sentBody).toEqual({
        model: 'claude-haiku-5-5',
        max_tokens: 512,
        system: 'Answer in one sentence.',
        messages: [{ role: 'user', content: 'Why is the sky blue?' }],
        output_config: { effort: 'low' },
        stream: true,
      });
    });

    it.each([
      ['no system prompt', WITHOUT_SYSTEM],
      ['a blank system prompt', { ...REQUEST, system: ' \n' }],
    ])('sends no system field for %s', async (_case, request) => {
      const { sentBody } = await run(ANTHROPIC_ANSWER, request);

      expect(sentBody).not.toHaveProperty('system');
    });

    it('sends no temperature, which current models accept only at its default', async () => {
      const { sentBody } = await run(ANTHROPIC_ANSWER, { ...REQUEST, temperature: 0 });

      expect(sentBody).not.toHaveProperty('temperature');
    });
  });

  describe('the answer', () => {
    it('skips events it cannot read, and keeps the stop reason it has', async () => {
      const unreadable = [
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0\n\n',
        'event: content_block_delta\ndata: {"delta":{"type":"text_delta","text":7}}\n\n',
        'event: message_delta\ndata: {"delta":{"stop_reason":null}}\n\n',
      ].join('');
      const end = ANTHROPIC_MAX_TOKENS_WHILE_THINKING.indexOf('event: message_stop');

      const { texts, error } = await run(
        ANTHROPIC_MAX_TOKENS_WHILE_THINKING.slice(0, end) +
          unreadable +
          ANTHROPIC_MAX_TOKENS_WHILE_THINKING.slice(end),
      );

      expect(texts).toEqual([]);
      expect(error).toHaveProperty('message', expect.stringContaining('used up Max tokens'));
    });

    it('skips the thinking, and yields only the text', async () => {
      const { texts } = await run(ANTHROPIC_ANSWER);

      expect(texts).toEqual(['The sky is blue: ', 'небо голубое, ', '天空是蓝色的 🌍✨']);
      expect(texts.join('')).not.toContain('Short question');
    });

    it('ends with the text that fits when the answer reaches max tokens', async () => {
      const { texts, error } = await run(ANTHROPIC_MAX_TOKENS_AFTER_TEXT);

      expect(texts).toEqual(['The sky is']);
      expect(error).toBeUndefined();
    });

    it('fails with bad-request when thinking used up max tokens before any text', async () => {
      const { texts, error } = await run(ANTHROPIC_MAX_TOKENS_WHILE_THINKING);

      expect(texts).toEqual([]);
      expect(error).toEqual(
        new LlmError(
          'bad-request',
          'Anthropic used up Max tokens before writing an answer. Raise Max tokens and try again.',
        ),
      );
    });

    it('fails with bad-request when the model declines the prompt', async () => {
      const { error } = await run(ANTHROPIC_REFUSAL);

      expect(error).toEqual(
        new LlmError('bad-request', 'Anthropic declined to answer this prompt.'),
      );
    });
  });

  describe('error events', () => {
    it('fails after the text that came, by the type of the error', async () => {
      const { texts, error } = await run(ANTHROPIC_OVERLOADED_MIDWAY);

      expect(texts).toEqual(['The sky']);
      expect(error).toEqual(
        new LlmError(
          'upstream-error',
          'Anthropic failed to answer (overloaded_error). Try again later.',
        ),
      );
    });

    it.each([
      ['invalid_request_error', 'bad-request'],
      ['request_too_large', 'bad-request'],
      ['authentication_error', 'invalid-key'],
      ['permission_error', 'invalid-key'],
      ['rate_limit_error', 'rate-limited'],
      ['api_error', 'upstream-error'],
      ['timeout_error', 'upstream-error'],
      ['a_type_added_later', 'upstream-error'],
    ])('reports the error type %s as %s', async (type, code) => {
      const { error } = await run(
        errorEvent(JSON.stringify({ type: 'error', error: { type, message: 'Something' } })),
      );

      expect(error).toBeInstanceOf(LlmError);
      expect(error).toHaveProperty('code', code);
      expect(error).toHaveProperty('message', expect.stringContaining(`(${type})`));
      expect(error).toHaveProperty('message', expect.not.stringContaining('Something'));
    });

    it.each([
      ['data that is not JSON', 'Overloaded'],
      ['an error without a type', '{"type":"error","error":{"message":"Overloaded"}}'],
      [
        'a type that does not look like one',
        `{"type":"error","error":{"type":"${TEST_API_KEY}","message":"Overloaded"}}`,
      ],
    ])('reports %s as upstream-error, quoting nothing', async (_case, data) => {
      const { error } = await run(errorEvent(data));

      expect(error).toEqual(
        new LlmError('upstream-error', 'Anthropic failed to answer. Try again later.'),
      );
    });
  });
});
