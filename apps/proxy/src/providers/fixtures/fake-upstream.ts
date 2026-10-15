import type { LlmRequest } from '@pipeline-builder/core';

import type { Provider } from '../provider';
import type { UpstreamProviderOptions } from '../upstream';

/** The user's API key in tests: it must never show up anywhere but the upstream request headers. */
export const TEST_API_KEY = 'sk-test-0123456789-secret';

/** A request the fake upstream received. */
export interface UpstreamCall {
  readonly url: string;
  readonly init: RequestInit;
}

/** How the fake upstream answers. */
export interface FakeAnswer {
  /** 200 by default. */
  readonly status?: number;
  /** `text/event-stream; charset=utf-8` by default. */
  readonly contentType?: string;
  /** The response body, piece by piece: text is sent as UTF-8, bytes as they are. */
  readonly body?: readonly (string | Uint8Array)[];
  /**
   * What happens after the last piece: the body ends (the default), stays open without sending
   * anything more, or breaks off as a lost connection does.
   */
  readonly after?: 'end' | 'stay-open' | 'break';
}

/** A stand-in for a provider's API, behind a `fetch` that records what it was sent. */
export interface FakeUpstream {
  readonly fetch: typeof fetch;
  readonly calls: readonly UpstreamCall[];
  /** Whether the reader of the response body cancelled it. */
  readonly bodyCancelled: boolean;
}

const encoder = new TextEncoder();

/**
 * A fake upstream that answers every request with `answer`, or never answers (`'silent'`), as a
 * provider that does not respond. Like the runtime's `fetch`, it honours the request's signal: an
 * abort rejects a request that has not been answered and breaks off the body of one that has.
 */
export function createFakeUpstream(answer: FakeAnswer | 'silent'): FakeUpstream {
  const calls: UpstreamCall[] = [];
  let bodyCancelled = false;

  const fakeFetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    calls.push({ url: urlOf(input), init });
    const { signal } = init;
    if (signal?.aborted === true) return Promise.reject(abortError());

    if (answer === 'silent') {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(abortError());
        });
      });
    }

    const pieces = [...(answer.body ?? [])];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        signal?.addEventListener('abort', () => {
          controller.error(abortError());
        });
      },
      pull(controller) {
        const piece = pieces.shift();
        if (piece !== undefined) {
          controller.enqueue(typeof piece === 'string' ? encoder.encode(piece) : piece);
          return undefined;
        }
        switch (answer.after ?? 'end') {
          case 'end':
            controller.close();
            return undefined;
          case 'break':
            controller.error(new TypeError('Network connection lost.'));
            return undefined;
          case 'stay-open':
            // Never settles, so the stream waits for a piece that never comes.
            return new Promise<undefined>(() => undefined);
        }
      },
      cancel() {
        bodyCancelled = true;
      },
    });
    return Promise.resolve(
      new Response(body, {
        status: answer.status ?? 200,
        headers: { 'Content-Type': answer.contentType ?? 'text/event-stream; charset=utf-8' },
      }),
    );
  };

  return {
    fetch: fakeFetch,
    calls,
    get bodyCancelled() {
      return bodyCancelled;
    },
  };
}

/** What a provider did with one request to a fake upstream. */
export interface ProviderRun {
  /** The upstream request it sent. */
  readonly call: UpstreamCall;
  /** Its JSON body. */
  readonly sentBody: unknown;
  /** The texts it yielded. */
  readonly texts: readonly string[];
  /** The error it threw, if any. */
  readonly error: unknown;
}

/**
 * Streams `request` from the provider `create` makes, with the test key, while a fake upstream
 * answers with `answer`: an event stream, or a whole answer with its status.
 */
export async function runProvider(
  create: (options: UpstreamProviderOptions) => Provider,
  answer: string | FakeAnswer,
  request: LlmRequest,
): Promise<ProviderRun> {
  const upstream = createFakeUpstream(typeof answer === 'string' ? { body: [answer] } : answer);
  const provider = create({ fetch: upstream.fetch });
  const texts: string[] = [];
  let error: unknown;
  try {
    const context = { signal: new AbortController().signal, apiKey: TEST_API_KEY };
    for await (const text of provider.stream(request, context)) texts.push(text);
  } catch (caught) {
    error = caught;
  }

  const [call] = upstream.calls;
  if (call === undefined) throw new Error('The provider sent no upstream request');
  if (typeof call.init.body !== 'string') throw new Error('The upstream request has no JSON body');
  const sentBody: unknown = JSON.parse(call.init.body);
  return { call, sentBody, texts, error };
}

/** An event stream with one `error` event whose data is `data`. */
export function errorEvent(data: string): string {
  return `event: error
data: ${data}

`;
}

/** `text` as UTF-8, one byte per piece, so every character of more than one byte is split. */
export function byteByByte(text: string): Uint8Array[] {
  return Array.from(encoder.encode(text), (byte) => Uint8Array.of(byte));
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}
