import { LLM_PROVIDER_INFO, type LlmRequest } from '@pipeline-builder/core';

import type { Provider } from './provider';
import {
  createUpstreamProvider,
  type UpstreamEventReader,
  type UpstreamProviderOptions,
  type UpstreamStep,
} from './upstream';
import {
  refusalError,
  tokenLimitError,
  upstreamError,
  type UpstreamFailureCode,
} from './upstream-errors';
import { objectField, parseJsonObject, stringField } from './upstream-json';

/** The Responses API endpoint. */
export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

/** The smallest `max_output_tokens` the Responses API accepts. */
export const OPENAI_MIN_OUTPUT_TOKENS = 16;

const TITLE = LLM_PROVIDER_INFO.openai.title;

/** The fields of a Responses API request that the adapter sends. */
interface ResponsesRequest {
  readonly model: string;
  readonly input: string;
  readonly instructions?: string;
  readonly max_output_tokens: number;
  readonly reasoning: { readonly effort: 'low' };
  readonly store: false;
  readonly stream: true;
}

/**
 * The OpenAI provider: streams the Responses API (`POST /v1/responses` with `stream: true`) with
 * the user's key as a bearer token. The prompt is the `input` and the system prompt, unless blank,
 * the `instructions`; `maxTokens` is the `max_output_tokens` (at least 16, the API's minimum). It
 * asks reasoning models such as GPT-6 Luna for low reasoning effort, so reasoning leaves most of
 * the tokens to the answer, and sends no `temperature`, which OpenAI's guide for GPT-6 models says
 * to remove unless reasoning effort is `none`. `store: false` keeps OpenAI from storing the
 * response for later retrieval.
 *
 * The text of `response.output_text.delta` events is the answer and `response.completed` ends it.
 * `response.incomplete` ends it too, unless the content filter stopped it or the token limit came
 * before any text; a refusal (`response.refusal.delta` or `.done`) fails it with `bad-request`;
 * `response.failed` and `error` events fail it by their error code.
 */
export function createOpenAiProvider(options?: UpstreamProviderOptions): Provider {
  return createUpstreamProvider(
    {
      provider: 'openai',
      url: OPENAI_RESPONSES_URL,
      headers: (apiKey) => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      }),
      body: responsesRequest,
      createEventReader: createResponsesEventReader,
      isBillingFailure: (error) =>
        isQuotaFailure(stringField(error, 'code'), stringField(error, 'type')),
    },
    options,
  );
}

function responsesRequest({ model, prompt, system, maxTokens }: LlmRequest): ResponsesRequest {
  return {
    model,
    input: prompt,
    ...(system === undefined || system.trim() === '' ? {} : { instructions: system }),
    max_output_tokens: Math.max(maxTokens, OPENAI_MIN_OUTPUT_TOKENS),
    reasoning: { effort: 'low' },
    store: false,
    stream: true,
  };
}

function createResponsesEventReader(): UpstreamEventReader {
  let wroteText = false;

  return ({ event, data }) => {
    switch (event) {
      case 'response.output_text.delta': {
        const text = stringField(parseJsonObject(data), 'delta');
        if (text === undefined) return null;
        wroteText ||= text !== '';
        return { type: 'text', text };
      }
      case 'response.refusal.delta':
      case 'response.refusal.done':
        // The model writes why it declines; the proxy reports the refusal, not the text.
        return { type: 'error', error: refusalError(TITLE) };
      case 'response.completed':
        return { type: 'done' };
      case 'response.incomplete': {
        const response = objectField(parseJsonObject(data), 'response');
        const reason = stringField(objectField(response, 'incomplete_details'), 'reason');
        return endOfIncomplete(reason, wroteText);
      }
      case 'response.failed': {
        const error = objectField(objectField(parseJsonObject(data), 'response'), 'error');
        return failure(stringField(error, 'code'), undefined);
      }
      case 'error': {
        // The error's fields come in an `error` object, or in the event itself, whose own `type`
        // is then just "error".
        const json = parseJsonObject(data);
        const error = objectField(json, 'error');
        return error === undefined
          ? failure(stringField(json, 'code'), undefined)
          : failure(stringField(error, 'code'), stringField(error, 'type'));
      }
      default:
        // response.created, output items and content parts, reasoning, and events added later.
        return null;
    }
  };
}

function endOfIncomplete(reason: string | undefined, wroteText: boolean): UpstreamStep {
  if (reason === 'content_filter') return { type: 'error', error: refusalError(TITLE) };
  if (!wroteText && reason === 'max_output_tokens') {
    return { type: 'error', error: tokenLimitError(TITLE) };
  }
  return { type: 'done' };
}

function failure(code: string | undefined, type: string | undefined): UpstreamStep {
  return {
    type: 'error',
    error: upstreamError(TITLE, failureCode(code, type), {
      type: code ?? type,
      billing: isQuotaFailure(code, type),
    }),
  };
}

/** Whether the account of the key has used up its quota or credit (`insufficient_quota`). */
function isQuotaFailure(code: string | undefined, type: string | undefined): boolean {
  return code === 'insufficient_quota' || type === 'insufficient_quota';
}

/** What an error code or type of the Responses API means for the user. */
function failureCode(code: string | undefined, type: string | undefined): UpstreamFailureCode {
  if (code === 'rate_limit_exceeded' || code === 'insufficient_quota') return 'rate-limited';
  if (code === 'invalid_api_key' || type === 'authentication_error') return 'invalid-key';
  if (code === 'invalid_prompt' || type === 'invalid_request_error') return 'bad-request';
  return 'upstream-error';
}
