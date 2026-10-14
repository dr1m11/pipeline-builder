import * as z from 'zod';

import { assertNever } from '../assert-never';
import { isJsonObject, type JsonValue } from '../persistence/json';
import { err, ok, type Result } from '../result';
import { LLM_ERROR_CODES, type LlmErrorCode } from './llm-error';
import type { SseEvent } from './sse-parser';

/**
 * What the proxy streams back for an LLM request: the answer as `token`s, in order, then `done`.
 * A request that fails midway ends with an `error` instead; every stream ends with one of the two.
 */
export type LlmStreamEvent =
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly code: LlmErrorCode; readonly message: string };

const LLM_STREAM_EVENT_SCHEMA = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), code: z.enum(LLM_ERROR_CODES), message: z.string() }),
]);

const LLM_STREAM_EVENT_TYPES: ReadonlySet<string> = new Set(
  LLM_STREAM_EVENT_SCHEMA.options.map(({ shape }) => shape.type.value),
);

/**
 * Writes a stream event as an SSE event for the proxy to send: the event name is its `type`, and
 * the data is the rest of it as JSON on one line (`{"text":"Hi"}`, `{}` for `done`).
 */
export function formatLlmStreamEvent(event: LlmStreamEvent): Pick<SseEvent, 'event' | 'data'> {
  return { event: event.type, data: JSON.stringify(eventData(event)) };
}

function eventData(event: LlmStreamEvent): Readonly<Record<string, string>> {
  switch (event.type) {
    case 'token':
      return { text: event.text };
    case 'done':
      return {};
    case 'error':
      return { code: event.code, message: event.message };
    default:
      return assertNever(event);
  }
}

/**
 * Reads an SSE event sent with `formatLlmStreamEvent` back into a stream event. An unknown event
 * name, data that is not a JSON object, or a missing or invalid field is an error with a short
 * description; fields it does not know are dropped.
 */
export function parseLlmStreamEvent({ event, data }: SseEvent): Result<LlmStreamEvent, string> {
  if (!LLM_STREAM_EVENT_TYPES.has(event)) return err(`Unknown stream event "${event}"`);

  let json: JsonValue;
  try {
    // `JSON.parse` is typed `any`, but it only ever returns JSON values.
    json = JSON.parse(data) as JsonValue;
  } catch {
    return err(`The data of the "${event}" event is not JSON`);
  }
  if (!isJsonObject(json)) return err(`The data of the "${event}" event is not a JSON object`);

  const parsed = LLM_STREAM_EVENT_SCHEMA.safeParse({ ...json, type: event });
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      ({ path, message }) => `${z.core.toDotPath(path)}: ${message}`,
    );
    return err(`The "${event}" event is invalid (${issues.join('; ')})`);
  }
  return ok(parsed.data);
}
