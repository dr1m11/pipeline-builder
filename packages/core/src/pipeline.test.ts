import { describe, expect, it } from 'vitest';

import { createEmptyPipeline, parsePipelineName, PIPELINE_NAME_MAX_LENGTH } from './pipeline';
import { SCHEMA_VERSION } from './schema-version';

describe('createEmptyPipeline', () => {
  it('creates a pipeline without nodes or edges in the current schema version', () => {
    expect(createEmptyPipeline({ id: 'p-1', name: 'Summarize' })).toEqual({
      schemaVersion: SCHEMA_VERSION,
      id: 'p-1',
      name: 'Summarize',
      nodes: [],
      edges: [],
    });
  });

  it('returns a new object on every call', () => {
    const first = createEmptyPipeline({ id: 'p-1', name: 'A' });
    const second = createEmptyPipeline({ id: 'p-1', name: 'A' });
    expect(first).not.toBe(second);
    expect(first.nodes).not.toBe(second.nodes);
  });
});

describe('parsePipelineName', () => {
  it('trims surrounding whitespace', () => {
    expect(parsePipelineName('  Draft  ')).toEqual({ ok: true, value: 'Draft' });
  });

  it('rejects an empty or whitespace-only name', () => {
    expect(parsePipelineName('')).toEqual({ ok: false, error: 'empty' });
    expect(parsePipelineName('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('accepts a name at the length limit and rejects a longer one', () => {
    const atLimit = 'x'.repeat(PIPELINE_NAME_MAX_LENGTH);
    expect(parsePipelineName(atLimit)).toEqual({ ok: true, value: atLimit });
    expect(parsePipelineName(`${atLimit}x`)).toEqual({ ok: false, error: 'too-long' });
  });
});
