import { describe, expect, it } from 'vitest';

import { createSseParser, type SseEvent } from './sse-parser';

/** The events a new parser reads from `chunks`, pushed in order, then the end of the stream. */
function parse(chunks: readonly string[]): SseEvent[] {
  const parser = createSseParser();
  return [...chunks.flatMap((chunk) => parser.push(chunk)), ...parser.end()];
}

/** `text` cut at `cuts`, which are positions in ascending order. */
function cut(text: string, cuts: readonly number[]): string[] {
  return [0, ...cuts].map((start, index) => text.slice(start, cuts[index] ?? text.length));
}

// Every rule at once, with all three line ends: a comment, a named event, multi-line data, data
// without the space after the colon or with two, a field without a colon, an id, `retry`, an event
// without data and an unfinished event at the end.
const STREAM = [
  ': keep-alive\r\n',
  'event: token\r\n',
  'data: {"text":"Hi"}\r\n',
  '\r\n',
  'id: 7\n',
  'data: first line\n',
  'data:second line\n',
  'data:  two spaces\n',
  '\n',
  'event: done\r',
  'data\r',
  '\r',
  'retry: 3000\r\n',
  'event: no-data\r\n',
  '\r\n',
  'data: last\r\n',
  '\r\n',
  'data: unfinished\n',
].join('');

const STREAM_EVENTS: readonly SseEvent[] = [
  { event: 'token', data: '{"text":"Hi"}', id: '' },
  { event: 'message', data: 'first line\nsecond line\n two spaces', id: '7' },
  { event: 'done', data: '', id: '7' },
  { event: 'message', data: 'last', id: '7' },
];

// Line breaks of every kind next to each other. A CRLF read as two line breaks would end the first
// event after `a` instead of joining `a` and `b`.
const LINE_BREAKS = 'data: a\r\ndata: b\r\n\r\ndata: c\r\rdata: d\n\r\n';

const LINE_BREAK_EVENTS: readonly SseEvent[] = [
  { event: 'message', data: 'a\nb', id: '' },
  { event: 'message', data: 'c', id: '' },
  { event: 'message', data: 'd', id: '' },
];

describe('createSseParser', () => {
  it('reads a stream given whole', () => {
    expect(parse([STREAM])).toEqual(STREAM_EVENTS);
  });

  it('reads a stream cut once anywhere', () => {
    for (let position = 0; position <= STREAM.length; position += 1) {
      expect(parse(cut(STREAM, [position])), `cut at ${String(position)}`).toEqual(STREAM_EVENTS);
    }
  });

  it('reads a stream given one character at a time', () => {
    const characters = Array.from({ length: STREAM.length }, (_, index) => STREAM.charAt(index));

    expect(parse(characters)).toEqual(STREAM_EVENTS);
  });

  it('reads line breaks cut twice anywhere, empty pieces included', () => {
    for (let first = 0; first <= LINE_BREAKS.length; first += 1) {
      for (let second = first; second <= LINE_BREAKS.length; second += 1) {
        expect(
          parse(cut(LINE_BREAKS, [first, second])),
          `cuts at ${String([first, second])}`,
        ).toEqual(LINE_BREAK_EVENTS);
      }
    }
  });

  it('returns an event from the push that brings its blank line', () => {
    const parser = createSseParser();

    expect(parser.push('event: token\ndata: {"text":')).toEqual([]);
    expect(parser.push('"Hi"}\n')).toEqual([]);
    expect(parser.push('\ndata: next')).toEqual([
      { event: 'token', data: '{"text":"Hi"}', id: '' },
    ]);
  });

  it('returns an event that ends with a CR without waiting for the next piece', () => {
    const parser = createSseParser();

    expect(parser.push('data: x\r\r')).toEqual([{ event: 'message', data: 'x', id: '' }]);
    expect(parser.push('\n')).toEqual([]);
  });

  it('treats CR, LF and CRLF alike, and a CR then a LF in the next piece as one line break', () => {
    const events = [{ event: 'message', data: 'x\ny', id: '' }];

    expect(parse(['data: x\rdata: y\r\r'])).toEqual(events);
    expect(parse(['data: x\ndata: y\n\n'])).toEqual(events);
    expect(parse(['data: x\r\ndata: y\r\n\r\n'])).toEqual(events);
    expect(parse(['data: x\r', '', '\ndata: y\r', '\n\r', '\n'])).toEqual(events);
  });

  it('names an event "message" unless it has an event field, and uses the last one', () => {
    expect(parse(['data: a\n\nevent: first\nevent: second\ndata: b\n\n'])).toEqual([
      { event: 'message', data: 'a', id: '' },
      { event: 'second', data: 'b', id: '' },
    ]);
  });

  it('joins data fields with line feeds and keeps the empty ones', () => {
    expect(parse(['data: one\ndata\ndata:\ndata: two\n\n'])).toEqual([
      { event: 'message', data: 'one\n\n\ntwo', id: '' },
    ]);
  });

  it('dispatches an event whose only data field is empty', () => {
    expect(parse(['data\n\n', 'event: done\ndata:\n\n'])).toEqual([
      { event: 'message', data: '', id: '' },
      { event: 'done', data: '', id: '' },
    ]);
  });

  it('drops one space after the colon and keeps the rest of the value as it is', () => {
    expect(parse(['data:   indented: with a colon \n\n'])).toEqual([
      { event: 'message', data: '  indented: with a colon ', id: '' },
    ]);
  });

  it('skips an event without data and forgets its event name', () => {
    expect(parse(['event: lonely\n\ndata: x\n\n'])).toEqual([
      { event: 'message', data: 'x', id: '' },
    ]);
  });

  it('skips comments, retry, unknown fields and fields in another case', () => {
    expect(
      parse([':comment\n: ping\nretry: 1000\nretry: soon\nfoo: bar\nData: no\nEVENT: no\n\n']),
    ).toEqual([]);
  });

  it('keeps the last id for the events after it, even one set by an event without data', () => {
    expect(parse(['id: 1\n\ndata: a\n\ndata: b\nid: 2\n\ndata: c\n\n'])).toEqual([
      { event: 'message', data: 'a', id: '1' },
      { event: 'message', data: 'b', id: '2' },
      { event: 'message', data: 'c', id: '2' },
    ]);
  });

  it('clears the id with an empty id field and ignores an id with a NULL character', () => {
    expect(parse(['id: 1\ndata: a\n\nid: 2\u00003\ndata: b\n\nid\ndata: c\n\n'])).toEqual([
      { event: 'message', data: 'a', id: '1' },
      { event: 'message', data: 'b', id: '1' },
      { event: 'message', data: 'c', id: '' },
    ]);
  });

  it('discards the event and the line the stream did not finish', () => {
    const parser = createSseParser();

    expect(parser.push('data: whole\n')).toEqual([]);
    expect(parser.push('data: half')).toEqual([]);
    expect(parser.end()).toEqual([]);
  });

  it('reads a new stream after the end, with nothing left from the old one', () => {
    const parser = createSseParser();
    parser.push('id: 1\nevent: old\ndata: old\r');
    parser.end();

    expect(parser.push('\ndata: new\n\n')).toEqual([{ event: 'message', data: 'new', id: '' }]);
  });

  it('reads nothing from an empty stream', () => {
    expect(parse([])).toEqual([]);
    expect(parse(['', ''])).toEqual([]);
  });
});
