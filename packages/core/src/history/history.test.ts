import { describe, expect, it } from 'vitest';

import { executeCommand, type PipelineCommand } from '../commands/pipeline-command';
import { createEmptyPipeline, type Pipeline } from '../pipeline';
import {
  createHistoryEntry,
  EMPTY_HISTORY,
  type History,
  HISTORY_LIMIT,
  type HistoryEntry,
  type HistoryStep,
  MERGE_WINDOW_MS,
  recordChange,
  redoChange,
  undoChange,
} from './history';

/** A distinct document: a history compares documents by identity only. */
function version(index: number): Pipeline {
  return createEmptyPipeline({ id: `p${String(index)}`, name: `Version ${String(index)}` });
}

const [a, b, c, d] = [version(0), version(1), version(2), version(3)];

/** `count` entries that continue one another (version 0 → 1 → 2…), with the given fields. */
function chain(count: number, fields: (index: number) => Partial<HistoryEntry> = () => ({})) {
  let before = version(0);
  const versions = [before];
  const entries: HistoryEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const after = version(index + 1);
    versions.push(after);
    entries.push(entry(before, after, fields(index)));
    before = after;
  }
  return { versions, entries };
}

function entry(
  before: Pipeline,
  after: Pipeline,
  { label = 'Change', mergeKey = null, at = 0 }: Partial<HistoryEntry> = {},
): HistoryEntry {
  return { label, mergeKey, before, after, at, replacesDocument: false };
}

/** Records entries one after another. */
function recordAll(entries: readonly HistoryEntry[]): History {
  return entries.reduce<History>((current, next) => recordChange(current, next), EMPTY_HISTORY);
}

/** An undo or redo that must be possible; fails the test otherwise. */
function possible(step: HistoryStep | null): HistoryStep {
  if (step === null) throw new Error('Expected something to undo or redo');
  return step;
}

/** The pipeline a command produces; fails the test on an error. */
function executed(pipeline: Pipeline, command: PipelineCommand): Pipeline {
  const result = executeCommand(pipeline, command);
  if (!result.ok) throw new Error(`Unexpected error: ${result.error}`);
  return result.value;
}

describe('EMPTY_HISTORY', () => {
  it('has nothing to undo or redo', () => {
    expect(EMPTY_HISTORY).toEqual({ past: [], future: [] });
    expect(undoChange(EMPTY_HISTORY)).toBeNull();
    expect(redoChange(EMPTY_HISTORY)).toBeNull();
  });
});

describe('createHistoryEntry', () => {
  it('labels and keys the entry from the command', () => {
    const command: PipelineCommand = { type: 'rename-node', nodeId: 'n', label: 'Answer' };
    expect(createHistoryEntry(command, { before: a, after: b, at: 42 })).toEqual({
      label: 'Rename n',
      mergeKey: 'label:n',
      before: a,
      after: b,
      at: 42,
      replacesDocument: false,
    });
  });

  it('marks a replaced document', () => {
    const command: PipelineCommand = { type: 'replace-pipeline', pipeline: b, reason: 'new' };
    expect(createHistoryEntry(command, { before: a, after: b, at: 0 })).toMatchObject({
      label: 'New pipeline',
      mergeKey: null,
      replacesDocument: true,
    });
  });
});

describe('recordChange', () => {
  it('appends entries, newest last', () => {
    const first = entry(a, b);
    const second = entry(b, c);
    expect(recordAll([first, second])).toEqual({ past: [first, second], future: [] });
  });

  it('clears what could be redone', () => {
    const undone = possible(undoChange(recordAll([entry(a, b)])));
    expect(undone.history.future).toHaveLength(1);
    const next = entry(a, c);
    expect(recordChange(undone.history, next)).toEqual({
      past: [next],
      future: [],
    });
  });

  it('ignores an entry that changes nothing and keeps redo available', () => {
    const { history } = possible(undoChange(recordAll([entry(a, b)])));
    expect(recordChange(history, entry(a, a))).toBe(history);
  });

  it('keeps at most the limit, dropping the oldest entries', () => {
    const { entries } = chain(HISTORY_LIMIT + 1);
    const history = recordAll(entries);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(history.past[0]).toBe(entries[1]);
    expect(history.past.at(-1)).toBe(entries.at(-1));
  });

  it('accepts a custom limit', () => {
    const second = entry(b, c);
    const history = recordChange(recordChange(EMPTY_HISTORY, entry(a, b)), second, { limit: 1 });
    expect(history.past).toEqual([second]);
  });

  describe('merging', () => {
    const KEY = 'data:llm:temperature';

    it('merges a continuation with the same key into the last entry', () => {
      const history = recordAll([
        entry(a, b, { label: 'Edit Temperature of LLM Call 1', mergeKey: KEY, at: 1000 }),
        entry(b, c, { label: 'Edit Temperature of LLM Call 1', mergeKey: KEY, at: 1500 }),
      ]);
      expect(history.past).toEqual([
        entry(a, c, { label: 'Edit Temperature of LLM Call 1', mergeKey: KEY, at: 1500 }),
      ]);
      expect(possible(undoChange(history)).pipeline).toBe(a);
    });

    it('keeps merging a burst in which each change follows the previous one closely', () => {
      const { versions, entries } = chain(4, (index) => ({
        mergeKey: KEY,
        at: index * MERGE_WINDOW_MS,
      }));
      const history = recordAll(entries);
      expect(history.past).toHaveLength(1);
      expect(history.past[0]).toMatchObject({
        before: versions[0],
        after: versions[4],
        at: 3 * MERGE_WINDOW_MS,
      });
    });

    it('does not merge after a pause longer than the window', () => {
      const history = recordAll([
        entry(a, b, { mergeKey: KEY, at: 0 }),
        entry(b, c, { mergeKey: KEY, at: MERGE_WINDOW_MS + 1 }),
      ]);
      expect(history.past).toHaveLength(2);
    });

    it('accepts a custom window', () => {
      const history = recordChange(
        recordChange(EMPTY_HISTORY, entry(a, b, { mergeKey: KEY, at: 0 })),
        entry(b, c, { mergeKey: KEY, at: 500 }),
        { mergeWindowMs: 100 },
      );
      expect(history.past).toHaveLength(2);
    });

    it('does not merge entries with different keys', () => {
      const history = recordAll([
        entry(a, b, { mergeKey: KEY }),
        entry(b, c, { mergeKey: 'data:llm:model' }),
      ]);
      expect(history.past).toHaveLength(2);
    });

    it('does not merge entries without a key', () => {
      expect(recordAll([entry(a, b), entry(b, c)]).past).toHaveLength(2);
      expect(recordAll([entry(a, b), entry(b, c, { mergeKey: KEY })]).past).toHaveLength(2);
    });

    it('does not merge into an entry whose result is not the current document', () => {
      const history = recordAll([entry(a, b, { mergeKey: KEY }), entry(c, d, { mergeKey: KEY })]);
      expect(history.past).toHaveLength(2);
    });

    it('does not merge after an undo', () => {
      // After the undo, `b → d` continues the top entry `a → b` with the same key within the
      // window: only the entry that could be redone stops the merge.
      const recorded = recordAll([
        entry(a, b, { mergeKey: KEY, at: 0 }),
        entry(b, c, { mergeKey: 'label:llm', at: 100 }),
      ]);
      const undone = possible(undoChange(recorded));
      expect(undone.pipeline).toBe(b);
      expect(undone.history.future).toHaveLength(1);
      const next = entry(b, d, { mergeKey: KEY, at: 200 });
      const history = recordChange(undone.history, next);
      expect(history.past).toHaveLength(2);
      expect(history.past.at(-1)).toBe(next);
      expect(history.future).toEqual([]);
    });
  });
});

describe('undoChange and redoChange', () => {
  const first = entry(a, b, { label: 'First' });
  const second = entry(b, c, { label: 'Second' });

  it('undo goes back to the document before the last change', () => {
    const step = undoChange(recordAll([first, second]));
    expect(step).toEqual({
      history: { past: [first], future: [second] },
      pipeline: b,
      entry: second,
    });
  });

  it('redo applies the last undone change again', () => {
    const undone = possible(undoChange(recordAll([first, second])));
    const redone = redoChange(undone.history);
    expect(redone).toEqual({
      history: { past: [first, second], future: [] },
      pipeline: c,
      entry: second,
    });
  });

  it('keeps the changes in order across several undos and redos', () => {
    const once = possible(undoChange(recordAll([first, second])));
    const twice = possible(undoChange(once.history));
    expect(twice.pipeline).toBe(a);
    expect(twice.history).toEqual({ past: [], future: [first, second] });
    expect(undoChange(twice.history)).toBeNull();

    const redone = possible(redoChange(twice.history));
    expect(redone.pipeline).toBe(b);
    expect(redone.entry).toBe(first);
    expect(redone.history).toEqual({ past: [first], future: [second] });
  });

  it('has nothing to redo after a new change', () => {
    expect(redoChange(recordAll([first, second]))).toBeNull();
  });
});

describe('history of executed commands', () => {
  it('undoes a typing burst in one step and a separate rename in another', () => {
    const start = executed(createEmptyPipeline({ id: 'p', name: 'Demo' }), {
      type: 'add-node',
      id: 'llm',
      kind: 'llm-call',
      position: { x: 0, y: 0 },
    });
    const commands: [PipelineCommand, number][] = [
      [{ type: 'update-node-data', nodeId: 'llm', changes: { model: 'g' } }, 0],
      [{ type: 'update-node-data', nodeId: 'llm', changes: { model: 'gp' } }, 200],
      [{ type: 'update-node-data', nodeId: 'llm', changes: { model: 'gpt' } }, 400],
      [{ type: 'rename-node', nodeId: 'llm', label: 'Answer' }, 600],
    ];
    let pipeline = start;
    let history = EMPTY_HISTORY;
    for (const [command, at] of commands) {
      const after = executed(pipeline, command);
      history = recordChange(history, createHistoryEntry(command, { before: pipeline, after, at }));
      pipeline = after;
    }
    expect(history.past.map((change) => change.label)).toEqual([
      'Edit Model of LLM Call 1',
      'Rename LLM Call 1',
    ]);

    const renameUndone = possible(undoChange(history));
    expect(renameUndone.pipeline.nodes[0]).toMatchObject({
      label: 'LLM Call 1',
      data: { model: 'gpt' },
    });
    expect(possible(undoChange(renameUndone.history)).pipeline).toBe(start);
  });
});
