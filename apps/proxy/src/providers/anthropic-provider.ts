import { type JsonObject, LLM_PROVIDER_INFO, type LlmRequest } from '@pipeline-builder/core';

import type { Provider } from './provider';
import {
  createUpstreamProvider,
  type UpstreamEventReader,
  type UpstreamProviderOptions,
  type UpstreamStep,
} from './upstream';
import {
  errorCodeForStatus,
  refusalError,
  tokenLimitError,
  upstreamError,
} from './upstream-errors';
import { objectField, parseJsonObject, stringField } from './upstream-json';

/** The Messages API endpoint. */
export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

/** The API version the adapter is written for, sent as the `anthropic-version` header. */
export const ANTHROPIC_VERSION = '2023-06-01';

const TITLE = LLM_PROVIDER_INFO.anthropic.title;

/** The fields of a Messages API request that the adapter sends. */
interface MessagesRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly system?: string;
  readonly messages: readonly { readonly role: 'user'; readonly content: string }[];
  readonly output_config: { readonly effort: 'low' };
  readonly stream: true;
}

/**
 * The Anthropic provider: streams the Messages API (`POST /v1/messages` with `stream: true`) with
 * the user's key in `x-api-key`. The prompt is the one user message and the system prompt, unless
 * blank, the `system` field. It asks for low effort, which on current models (Claude Haiku 5.5 and
 * later) keeps their adaptive thinking short, as thinking tokens count towards `max_tokens`. It
 * sends no `temperature`: current models reject any value but the default with a 400 error.
 *
 * The text of `text_delta` events is the answer and `message_stop` ends it; thinking, pings and
 * other events are skipped. An `error` event fails the answer by its error type; a `refusal` stop,
 * or a `max_tokens` stop before any text, fails it with `bad-request`.
 */
export function createAnthropicProvider(options?: UpstreamProviderOptions): Provider {
  return createUpstreamProvider(
    {
      provider: 'anthropic',
      url: ANTHROPIC_MESSAGES_URL,
      headers: (apiKey) => ({
        'content-type': 'application/json',
        'anthropic-version': ANTHROPIC_VERSION,
        'x-api-key': apiKey,
      }),
      body: messagesRequest,
      createEventReader: createMessagesEventReader,
      isBillingFailure,
    },
    options,
  );
}

function messagesRequest({ model, prompt, system, maxTokens }: LlmRequest): MessagesRequest {
  return {
    model,
    max_tokens: maxTokens,
    ...(system === undefined || system.trim() === '' ? {} : { system }),
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'low' },
    stream: true,
  };
}

/**
 * The HTTP status of each error type of the Messages API, for an `error` event, which arrives after
 * the response's 200 status (https://platform.claude.com/docs/en/api/errors).
 */
const ERROR_TYPE_STATUS: ReadonlyMap<string, number> = new Map([
  ['invalid_request_error', 400],
  ['authentication_error', 401],
  ['billing_error', 402],
  ['permission_error', 403],
  ['not_found_error', 404],
  ['request_too_large', 413],
  ['rate_limit_error', 429],
  ['api_error', 500],
  ['timeout_error', 504],
  ['overloaded_error', 529],
]);

/** Stop reasons that mean the model ran out of tokens. */
const TOKEN_LIMIT_STOPS: ReadonlySet<string> = new Set([
  'max_tokens',
  'model_context_window_exceeded',
]);

function createMessagesEventReader(): UpstreamEventReader {
  let wroteText = false;
  let stopReason: string | undefined;

  return ({ event, data }) => {
    switch (event) {
      case 'content_block_delta': {
        const delta = objectField(parseJsonObject(data), 'delta');
        const text = stringField(delta, 'text');
        if (stringField(delta, 'type') !== 'text_delta' || text === undefined) return null;
        wroteText ||= text !== '';
        return { type: 'text', text };
      }
      case 'message_delta':
        stopReason =
          stringField(objectField(parseJsonObject(data), 'delta'), 'stop_reason') ?? stopReason;
        return null;
      case 'message_stop':
        return endOfMessage(stopReason, wroteText);
      case 'error': {
        const error = objectField(parseJsonObject(data), 'error');
        const type = stringField(error, 'type');
        const status = type === undefined ? undefined : ERROR_TYPE_STATUS.get(type);
        return {
          type: 'error',
          error: upstreamError(TITLE, errorCodeForStatus(status ?? 500), {
            type,
            billing: isBillingFailure(error),
          }),
        };
      }
      default:
        // message_start, content_block_start/stop, ping, and events added later.
        return null;
    }
  };
}

// A spend limit set on the account answers 400 `invalid_request_error` with this message (or its
// workspace variant); only the message tells it from other bad requests. It is matched, never
// quoted (https://platform.claude.com/docs/en/api/rate-limits).
const SPEND_LIMIT_MESSAGE = /^You have reached your specified (?:workspace )?API usage limits/;

/**
 * Whether an Anthropic error means the account cannot pay: 402 `billing_error`, a spend limit set
 * on the account, or the usage tier's monthly cap (429 with `enforced_spend_limit_reached`).
 */
function isBillingFailure(error: JsonObject | undefined): boolean {
  return (
    stringField(error, 'type') === 'billing_error' ||
    stringField(objectField(error, 'details'), 'error_code') === 'enforced_spend_limit_reached' ||
    SPEND_LIMIT_MESSAGE.test(stringField(error, 'message') ?? '')
  );
}

function endOfMessage(stopReason: string | undefined, wroteText: boolean): UpstreamStep {
  if (stopReason === 'refusal') return { type: 'error', error: refusalError(TITLE) };
  if (!wroteText && stopReason !== undefined && TOKEN_LIMIT_STOPS.has(stopReason)) {
    return { type: 'error', error: tokenLimitError(TITLE) };
  }
  return { type: 'done' };
}
