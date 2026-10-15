import { LlmError, type LlmRequest } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { errorEvent, type FakeAnswer, runProvider, TEST_API_KEY } from './fixtures/fake-upstream';
import {
  OPENAI_ANSWER,
  OPENAI_CONTENT_FILTERED,
  OPENAI_ERROR_BODIES,
  OPENAI_ERROR_EVENT,
  OPENAI_FAILED_MIDWAY,
  OPENAI_INCOMPLETE_AFTER_TEXT,
  OPENAI_INCOMPLETE_WHILE_REASONING,
  OPENAI_QUOTA_BODY,
  OPENAI_REFUSAL,
} from './fixtures/openai-streams';
import {
  createOpenAiProvider,
  OPENAI_MIN_OUTPUT_TOKENS,
  OPENAI_RESPONSES_URL,
} from './openai-provider';

const WITHOUT_SYSTEM: LlmRequest = {
  provider: 'openai',
  model: 'gpt-6-luna',
  prompt: 'Why is the sky blue?',
  temperature: 0.7,
  maxTokens: 512,
};

const REQUEST: LlmRequest = { ...WITHOUT_SYSTEM, system: 'Answer in one sentence.' };

function run(answer: string | FakeAnswer, request: LlmRequest = REQUEST) {
  return runProvider(createOpenAiProvider, answer, request);
}

describe('createOpenAiProvider', () => {
  describe('the request', () => {
    it('streams a Responses API request with the key as a bearer token', async () => {
      const { call } = await run(OPENAI_ANSWER);

      expect(call.url).toBe('https://api.openai.com/v1/responses');
      expect(OPENAI_RESPONSES_URL).toBe(call.url);
      expect(call.init.method).toBe('POST');
      expect(Object.fromEntries(new Headers(call.init.headers))).toEqual({
        'content-type': 'application/json',
        authorization: `Bearer ${TEST_API_KEY}`,
      });
    });

    it('sends the prompt as input, the system prompt as instructions, and low reasoning effort', async () => {
      const { sentBody } = await run(OPENAI_ANSWER);

      expect(sentBody).toEqual({
        model: 'gpt-6-luna',
        input: 'Why is the sky blue?',
        instructions: 'Answer in one sentence.',
        max_output_tokens: 512,
        reasoning: { effort: 'low' },
        store: false,
        stream: true,
      });
    });

    it.each([
      ['no system prompt', WITHOUT_SYSTEM],
      ['a blank system prompt', { ...REQUEST, system: '  ' }],
    ])('sends no instructions for %s', async (_case, request) => {
      const { sentBody } = await run(OPENAI_ANSWER, request);

      expect(sentBody).not.toHaveProperty('instructions');
    });

    it.each([
      [1, 16],
      [15, 16],
      [16, 16],
      [32_768, 32_768],
    ])('asks for at least the 16 tokens the API needs: %d becomes %d', async (maxTokens, sent) => {
      const { sentBody } = await run(OPENAI_ANSWER, { ...REQUEST, maxTokens });

      expect(OPENAI_MIN_OUTPUT_TOKENS).toBe(16);
      expect(sentBody).toHaveProperty('max_output_tokens', sent);
    });

    it('sends no temperature, which OpenAI says to leave out at low effort', async () => {
      const { sentBody } = await run(OPENAI_ANSWER, { ...REQUEST, temperature: 0 });

      expect(sentBody).not.toHaveProperty('temperature');
    });
  });

  describe('the answer', () => {
    it('skips text events it cannot read', async () => {
      const unreadable =
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta"}\n\n';

      const { texts, error } = await run(unreadable + OPENAI_ANSWER);

      expect(texts).toEqual(['The sky is blue: ', 'небо голубое, ', '天空是蓝色的 🌍✨']);
      expect(error).toBeUndefined();
    });

    it('yields the text of the message, not the reasoning', async () => {
      const { texts, error } = await run(OPENAI_ANSWER);

      expect(texts).toEqual(['The sky is blue: ', 'небо голубое, ', '天空是蓝色的 🌍✨']);
      expect(error).toBeUndefined();
    });

    it('ends with the text that fits when the answer reaches max tokens', async () => {
      const { texts, error } = await run(OPENAI_INCOMPLETE_AFTER_TEXT);

      expect(texts).toEqual(['The sky is']);
      expect(error).toBeUndefined();
    });

    it('fails with bad-request when reasoning used up max tokens before any text', async () => {
      const { texts, error } = await run(OPENAI_INCOMPLETE_WHILE_REASONING);

      expect(texts).toEqual([]);
      expect(error).toEqual(
        new LlmError(
          'bad-request',
          'OpenAI used up Max tokens before writing an answer. Raise Max tokens and try again.',
        ),
      );
    });

    it('fails with bad-request when the model writes a refusal, without its text', async () => {
      const { texts, error } = await run(OPENAI_REFUSAL);

      expect(texts).toEqual([]);
      expect(error).toEqual(new LlmError('bad-request', 'OpenAI declined to answer this prompt.'));
    });

    it.each(['response.refusal.delta', 'response.refusal.done'])(
      'treats %s alone as a refusal',
      async (event) => {
        const { error } = await run(`event: ${event}\ndata: {"type":"${event}"}\n\n`);

        expect(error).toEqual(
          new LlmError('bad-request', 'OpenAI declined to answer this prompt.'),
        );
      },
    );

    it('fails with bad-request when the content filter stops the answer', async () => {
      const { error } = await run(OPENAI_CONTENT_FILTERED);

      expect(error).toEqual(new LlmError('bad-request', 'OpenAI declined to answer this prompt.'));
    });
  });

  describe('quota', () => {
    it('points to billing when the account is out of quota', async () => {
      const { error } = await run({ status: 429, body: [OPENAI_QUOTA_BODY] });

      expect(error).toEqual(
        new LlmError(
          'rate-limited',
          'OpenAI refused the request because the account of this API key is out of credit or over a spending limit (HTTP 429, insufficient_quota). Check its plan and billing.',
        ),
      );
    });

    it('asks to wait for a rate limit', async () => {
      const { error } = await run({ status: 429, body: [OPENAI_ERROR_BODIES[429]] });

      expect(error).toEqual(
        new LlmError(
          'rate-limited',
          'OpenAI is limiting requests with this API key (HTTP 429, rate_limit_exceeded). Wait a minute and try again.',
        ),
      );
    });

    it('points to billing for an insufficient_quota error in the stream', async () => {
      const { error } = await run(
        errorEvent('{"type":"error","code":"insufficient_quota","message":"Quota","param":null}'),
      );

      expect(error).toEqual(
        new LlmError(
          'rate-limited',
          'OpenAI refused the request because the account of this API key is out of credit or over a spending limit (insufficient_quota). Check its plan and billing.',
        ),
      );
    });
  });

  describe('failures in the stream', () => {
    it('fails after the text that came when the response fails, by its error code', async () => {
      const { texts, error } = await run(OPENAI_FAILED_MIDWAY);

      expect(texts).toEqual(['The sky']);
      expect(error).toEqual(
        new LlmError('upstream-error', 'OpenAI failed to answer (server_error). Try again later.'),
      );
    });

    it('fails on an error event, by its code, without quoting its message', async () => {
      const { error } = await run(OPENAI_ERROR_EVENT);

      expect(error).toEqual(
        new LlmError(
          'rate-limited',
          'OpenAI is limiting requests with this API key (rate_limit_exceeded). Wait a minute and try again.',
        ),
      );
    });

    it.each([
      [{ code: 'insufficient_quota' }, 'rate-limited', 'insufficient_quota'],
      [{ code: 'invalid_api_key' }, 'invalid-key', 'invalid_api_key'],
      [{ type: 'authentication_error' }, 'invalid-key', 'authentication_error'],
      [{ code: 'invalid_prompt' }, 'bad-request', 'invalid_prompt'],
      [
        { type: 'invalid_request_error', code: 'context_length_exceeded' },
        'bad-request',
        'context_length_exceeded',
      ],
      [{ type: 'server_error', code: null }, 'upstream-error', 'server_error'],
    ])('reports the error %o in an error object as %s', async (fields, code, quoted) => {
      const { error } = await run(
        errorEvent(JSON.stringify({ type: 'error', error: { ...fields, message: 'Something' } })),
      );

      expect(error).toBeInstanceOf(LlmError);
      expect(error).toHaveProperty('code', code);
      expect(error).toHaveProperty('message', expect.stringContaining(`(${quoted})`));
      expect(error).toHaveProperty('message', expect.not.stringContaining('Something'));
    });

    it.each([
      ['data that is not JSON', 'Rate limit reached'],
      ['an error event without a code', '{"type":"error","message":"Something","param":null}'],
    ])('reports %s as upstream-error, quoting nothing', async (_case, data) => {
      const { error } = await run(errorEvent(data));

      expect(error).toEqual(
        new LlmError('upstream-error', 'OpenAI failed to answer. Try again later.'),
      );
    });
  });
});
