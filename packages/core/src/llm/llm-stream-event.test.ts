import { describe, expect, expectTypeOf, it } from 'vitest';

import { LLM_CALL_DEFINITION } from '../nodes/llm-call';
import type { Result } from '../result';
import { LLM_ERROR_CODES } from './llm-error';
import { formatLlmStreamEvent, type LlmStreamEvent, parseLlmStreamEvent } from './llm-stream-event';
import { mockCompletion, splitIntoTokens } from './mock-completion';
import { createSseParser, type SseEvent } from './sse-parser';

/** An SSE event as the parser returns it, with the id the proxy never sets. */
function received(event: string, data: string): SseEvent {
  return { event, data, id: '' };
}

/** A formatted event as text on the wire, the way a server writes it. */
function wire({ event, data }: Pick<SseEvent, 'event' | 'data'>): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

describe('formatLlmStreamEvent', () => {
  it('names the SSE event after the type and puts the other fields in JSON data', () => {
    expect(formatLlmStreamEvent({ type: 'token', text: 'Hi' })).toEqual({
      event: 'token',
      data: '{"text":"Hi"}',
    });
    expect(formatLlmStreamEvent({ type: 'done' })).toEqual({ event: 'done', data: '{}' });
    expect(
      formatLlmStreamEvent({ type: 'error', code: 'timeout', message: 'No answer in time.' }),
    ).toEqual({ event: 'error', data: '{"code":"timeout","message":"No answer in time."}' });
  });

  it('keeps the data on one line whatever the text holds', () => {
    const { data } = formatLlmStreamEvent({ type: 'token', text: 'one\ntwo\r\nthree\r' });

    expect(data).not.toMatch(/[\r\n]/);
  });

  it('writes only the fields of the event type, in a fixed order', () => {
    const event = {
      message: 'Slow down.',
      extra: true,
      code: 'rate-limited',
      type: 'error',
    } as const;

    expect(formatLlmStreamEvent(event).data).toBe('{"code":"rate-limited","message":"Slow down."}');
  });
});

describe('parseLlmStreamEvent', () => {
  it.each<LlmStreamEvent>([
    { type: 'token', text: 'Hi' },
    { type: 'token', text: '' },
    { type: 'token', text: ' line\nbreaks and "quotes"' },
    { type: 'done' },
    ...LLM_ERROR_CODES.map((code) => ({ type: 'error' as const, code, message: 'Failed.' })),
  ])('reads back the formatted event %o', (event) => {
    const { event: name, data } = formatLlmStreamEvent(event);

    expect(parseLlmStreamEvent(received(name, data))).toEqual({ ok: true, value: event });
  });

  it('drops fields it does not know and takes the type from the event name', () => {
    expect(parseLlmStreamEvent(received('token', '{"text":"Hi","type":"done","n":1}'))).toEqual({
      ok: true,
      value: { type: 'token', text: 'Hi' },
    });
  });

  it.each([
    [received('message', '{}'), 'Unknown stream event "message"'],
    [received('Token', '{"text":"Hi"}'), 'Unknown stream event "Token"'],
    [received('done', ''), 'The data of the "done" event is not JSON'],
    [received('token', '{"text":'), 'The data of the "token" event is not JSON'],
    [received('token', '"Hi"'), 'The data of the "token" event is not a JSON object'],
    [received('done', '[]'), 'The data of the "done" event is not a JSON object'],
    [received('done', 'null'), 'The data of the "done" event is not a JSON object'],
  ])('rejects %o', (event, error) => {
    expect(parseLlmStreamEvent(event)).toEqual({ ok: false, error });
  });

  it.each([
    [received('token', '{}'), 'The "token" event is invalid (text: '],
    [received('token', '{"text":1}'), 'The "token" event is invalid (text: '],
    [
      received('error', '{"code":"oops","message":"Failed."}'),
      'The "error" event is invalid (code: ',
    ],
    [received('error', '{"code":"timeout"}'), 'The "error" event is invalid (message: '],
  ])('names the field that is missing or invalid in %o', (event, error) => {
    const result = parseLlmStreamEvent(event);

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error).toContain(error);
  });

  it('returns a stream event or a message', () => {
    expectTypeOf(parseLlmStreamEvent).returns.toEqualTypeOf<Result<LlmStreamEvent, string>>();
  });
});

describe('the LLM stream protocol', () => {
  it('carries a mock answer token by token through SSE text cut into odd pieces', () => {
    const answer = mockCompletion({
      ...LLM_CALL_DEFINITION.createData(),
      prompt: 'Answer the question: Why is the sky blue?',
    });
    const sent: LlmStreamEvent[] = [
      ...splitIntoTokens(answer).map((text) => ({ type: 'token' as const, text })),
      { type: 'done' },
    ];
    const text = sent.map((event) => wire(formatLlmStreamEvent(event))).join('');

    const parser = createSseParser();
    const events: SseEvent[] = [];
    for (let start = 0; start < text.length; start += 7) {
      events.push(...parser.push(text.slice(start, start + 7)));
    }
    events.push(...parser.end());
    const receivedEvents = events.map((event) => {
      const result = parseLlmStreamEvent(event);
      if (!result.ok) throw new Error(result.error);
      return result.value;
    });

    expect(receivedEvents).toEqual(sent);
    expect(receivedEvents.map((event) => (event.type === 'token' ? event.text : '')).join('')).toBe(
      answer,
    );
  });
});
