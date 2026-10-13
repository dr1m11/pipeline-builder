import { describeCommand } from '../commands/describe-command';
import { commandMergeKey, type PipelineCommand } from '../commands/pipeline-command';
import type { Pipeline } from '../pipeline';

/** Most entries a history keeps; recording beyond it drops the oldest. */
export const HISTORY_LIMIT = 100;

/** Longest pause, in milliseconds, between two changes with the same merge key that still merge. */
export const MERGE_WINDOW_MS = 1000;

/** One undoable step: the document before and after a change. */
export interface HistoryEntry {
  /** What the change did, for the UI ("Move 3 nodes"). */
  readonly label: string;
  /** Entries with the same non-null key may merge into one step (see `recordChange`). */
  readonly mergeKey: string | null;
  readonly before: Pipeline;
  readonly after: Pipeline;
  /** When the change was made, in milliseconds (e.g. `Date.now()`); it is set by the caller. */
  readonly at: number;
  /** Whether the change replaced the whole document (import, template, new pipeline). */
  readonly replacesDocument: boolean;
}

/**
 * Undoable changes of a document, in the order they were made: `past` ends with the change that
 * undo reverts, and `future` starts with the change that redo applies again. Only the document is
 * recorded; selection, sizes and drag positions are not.
 */
export interface History {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
}

/** A history with nothing to undo or redo. */
export const EMPTY_HISTORY: History = Object.freeze({
  past: Object.freeze([]),
  future: Object.freeze([]),
});

/** Options of `recordChange`. */
export interface RecordOptions {
  /** Most entries to keep; defaults to `HISTORY_LIMIT`. */
  readonly limit?: number;
  /** Longest pause between entries that merge; defaults to `MERGE_WINDOW_MS`. */
  readonly mergeWindowMs?: number;
}

/**
 * The history entry for a command that changed `before` into `after` at time `at`, labelled with
 * `describeCommand` and keyed with `commandMergeKey`.
 */
export function createHistoryEntry(
  command: PipelineCommand,
  change: { before: Pipeline; after: Pipeline; at: number },
): HistoryEntry {
  return {
    label: describeCommand(command, change.before),
    mergeKey: commandMergeKey(command),
    before: change.before,
    after: change.after,
    at: change.at,
    replacesDocument: command.type === 'replace-pipeline',
  };
}

/**
 * Records a change and clears the redo entries. The entry merges into the last one, which then
 * spans both changes (typing in a field, nudging nodes with the arrow keys), only when all hold:
 * - there is nothing to redo, so a change after an undo starts a new step;
 * - the last entry ended in the document this change starts from (`top.after === entry.before`);
 * - both have the same non-null merge key;
 * - the entry comes at most `mergeWindowMs` after the last one. The merged entry takes the newer
 *   time, so a burst of keystrokes keeps merging while each follows the previous one closely.
 *
 * An entry that changes nothing (`before === after`) is not recorded: the same history is returned
 * and redo stays available. Beyond `limit` entries the oldest are dropped.
 */
export function recordChange(
  history: History,
  entry: HistoryEntry,
  { limit = HISTORY_LIMIT, mergeWindowMs = MERGE_WINDOW_MS }: RecordOptions = {},
): History {
  if (entry.before === entry.after) return history;
  const top = history.past.at(-1);
  const merges =
    top !== undefined &&
    history.future.length === 0 &&
    top.after === entry.before &&
    entry.mergeKey !== null &&
    entry.mergeKey === top.mergeKey &&
    entry.at - top.at <= mergeWindowMs;
  const past = merges
    ? [...history.past.slice(0, -1), { ...top, after: entry.after, at: entry.at }]
    : [...history.past, entry];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    future: EMPTY_HISTORY.future,
  };
}

/** The outcome of an undo or a redo. */
export interface HistoryStep {
  readonly history: History;
  /** The document to show now. */
  readonly pipeline: Pipeline;
  /** The entry that was undone or redone, e.g. to tell whether it replaced the document. */
  readonly entry: HistoryEntry;
}

/**
 * Reverts the last change: the document goes back to the entry's `before`. Null when there is
 * nothing to undo.
 */
export function undoChange(history: History): HistoryStep | null {
  const entry = history.past.at(-1);
  if (entry === undefined) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    pipeline: entry.before,
    entry,
  };
}

/**
 * Applies the last undone change again: the document becomes the entry's `after`. Null when there
 * is nothing to redo.
 */
export function redoChange(history: History): HistoryStep | null {
  const [entry, ...future] = history.future;
  if (entry === undefined) return null;
  return {
    history: { past: [...history.past, entry], future },
    pipeline: entry.after,
    entry,
  };
}
