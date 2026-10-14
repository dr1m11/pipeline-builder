/** An event read from a `text/event-stream`, with what `EventSource` would dispatch for it. */
export interface SseEvent {
  /** The event type: the last `event` field, or `message` when the event has none. */
  readonly event: string;
  /** The `data` fields, joined by line feeds. */
  readonly data: string;
  /**
   * The last `id` the stream has set, by this event or an earlier one (`MessageEvent.lastEventId`);
   * empty while none has.
   */
  readonly id: string;
}

/** Reads a `text/event-stream` piece by piece; make one per stream with `createSseParser`. */
export interface SseParser {
  /** Reads the next piece of the stream; returns the events it completes, in order. */
  push(chunk: string): readonly SseEvent[];
  /**
   * Ends the stream and returns the events it still holds. The standard has none: the line and
   * the event the stream did not finish are discarded, as a server ends each event with a blank
   * line. The parser is then ready for a new stream.
   */
  end(): readonly SseEvent[];
}

// CRLF, a lone LF or a lone CR ends a line.
const LINE_BREAK = /\r\n?|\n/g;

/**
 * Creates an incremental parser for the server-sent events format of the WHATWG HTML standard
 * ("Interpreting an event stream"). Pieces may be split anywhere, inside a line or between the CR
 * and LF of a line break; an event is returned as soon as its blank line arrives. Comment lines are
 * skipped, one space after a field's colon is dropped, `data` fields are joined by line feeds, an
 * event without data is not dispatched, an `id` with a NULL character is ignored, and `retry` and
 * unknown fields are ignored too.
 *
 * It reads text: callers decode the bytes as UTF-8 first, for example with `TextDecoderStream`,
 * which also removes the byte order mark as the standard's decoding does.
 */
export function createSseParser(): SseParser {
  // The start of a line whose end has not arrived yet.
  let pending = '';
  // The last piece ended with a CR, so a LF at the start of the next one finishes that line break.
  let afterCarriageReturn = false;
  let data = '';
  let eventType = '';
  let lastEventId = '';

  function readLine(line: string): SseEvent | null {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return null;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const rawValue = colon === -1 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') {
      eventType = value;
    } else if (field === 'data') {
      data += `${value}\n`;
    } else if (field === 'id' && !value.includes('\u0000')) {
      lastEventId = value;
    }
    // `retry` only sets how long `EventSource` waits to reconnect, which callers do not do.
    return null;
  }

  function dispatch(): SseEvent | null {
    const hasData = data !== '';
    // Every data field ends the buffer with a line feed, which the event does not keep.
    const event = {
      event: eventType === '' ? 'message' : eventType,
      data: data.slice(0, -1),
      id: lastEventId,
    };
    data = '';
    eventType = '';
    return hasData ? event : null;
  }

  return {
    push(chunk) {
      if (chunk === '') return [];
      const text = afterCarriageReturn && chunk.startsWith('\n') ? chunk.slice(1) : chunk;
      afterCarriageReturn = chunk.endsWith('\r');

      const events: SseEvent[] = [];
      let lineStart = 0;
      for (const lineBreak of text.matchAll(LINE_BREAK)) {
        const event = readLine(pending + text.slice(lineStart, lineBreak.index));
        if (event !== null) events.push(event);
        pending = '';
        lineStart = lineBreak.index + lineBreak[0].length;
      }
      pending += text.slice(lineStart);
      return events;
    },

    end() {
      pending = '';
      afterCarriageReturn = false;
      data = '';
      eventType = '';
      lastEventId = '';
      return [];
    },
  };
}
