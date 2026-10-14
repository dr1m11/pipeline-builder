# 0009. Undo/redo: commands with snapshot history

- Status: Accepted
- Date: 2026-10-14

## Context

Stage A4 adds undo and redo ([#52](https://github.com/dr1m11/pipeline-builder/issues/52)). The product spec asks for undo/redo built on the command pattern, and every change to the document goes into the history. [ADR 0006](./0006-canvas-state-core-document-and-react-flow-view.md) made the core `Pipeline` the single source of truth, changed only through core operations that keep unchanged nodes and edges identical, and expected undo to keep pipeline snapshots.

Some changes come in bursts: the properties form commits a field on every keystroke, and the arrow keys nudge nodes one step at a time. One undo step per keystroke would make undo useless. A4 also replaces the whole document (import, templates, a new pipeline), and A9 adds real-time collaboration with Yjs.

## Decision

Every change to the document is a **command**, a typed data object that core executes with its pure graph operations. The **history** keeps a snapshot of the document before and after each command.

1. **Commands are data.** `PipelineCommand` is a union: `add-node`, `move-nodes`, `remove-elements` (a delete or a cut), `connect`, `update-node-data`, `rename-node`, `add-elements` (paste, duplicate) and `replace-pipeline` (import, template, new). `executeCommand(pipeline, command)` delegates to the existing operations and returns a `Result`. Ids of new elements come from the caller, so execution is deterministic. A command that changes nothing returns the same pipeline and is not recorded.
2. **Commands describe themselves.** `describeCommand(command, before)` gives the English label shown by the undo and redo buttons ("Move 3 nodes", "Edit Temperature of LLM Call 1"). Nodes are named by their labels before the change.
3. **The history stores snapshots, not inverses.** A `HistoryEntry` holds `before`, `after`, the label, a merge key, the time and whether it replaced the document. Undo sets the document to `before`, redo to `after`. Snapshots are cheap because core keeps unchanged objects identical (ADR 0006, rule 6): consecutive snapshots share everything the change did not touch.
4. **Only the document is recorded.** Selection, measured sizes, drag positions and the viewport are view state. They never enter the history, so undo reverts a change to the document, never only a selection, and a drag is one entry (ADR 0006, rule 3).
5. **Bursts merge.** `commandMergeKey` keys data edits by node and field names (`data:<node>:<fields>`), renames by node (`label:<node>`) and moves by the set of moved nodes (`move:<nodes>`); other commands have no key. A new entry merges into the last one only when all of these hold:
   - there is nothing to redo, so the first change after an undo starts a new step;
   - the last entry ends in the document the new one starts from (`top.after === entry.before`);
   - both keys are equal and not null;
   - at most `MERGE_WINDOW_MS` (1 s) has passed since the last entry.

   The merged entry keeps the older `before` and takes the newer `after` and time, so typing keeps merging while each keystroke follows the previous one within a second. The caller passes the time in; core has no clock.

   A burst that ends where it started (a nudge right and back left, a character typed and deleted) stays one entry: its `before` and `after` are different objects with the same content, so undoing it changes nothing visible. This is accepted: detecting it would take a deep comparison on every merge, and the extra step is rare and harmless.

6. **At most `HISTORY_LIMIT` (100) entries.** The oldest are dropped. Recording a change clears the redo entries.
7. **Replacing the document is an undoable command.** Import, a template and New go through `replace-pipeline`, so they can be undone and need no confirmation dialog. This refines ADR 0006: the editor keeps **one store per editor** and replaces its document, instead of a store per loaded document. Entries that replace the document are flagged (`replacesDocument`), so the canvas can fit the view again after undo and redo too.
8. **The web store has a single `execute` path.** Its actions build commands and pass them to one `execute`, which runs `executeCommand`, records the entry (`createHistoryEntry`, `recordChange`) and drops view state of elements that no longer exist. Undo and redo take the document from the history.

## Consequences

- Each change has one implementation. Actions, paste, import and templates all go through `executeCommand`, and undo cannot drift from what an operation did, because it restores the exact earlier object.
- Memory grows with the number of changed objects, not with the size of the document: the snapshot after an edit to one node shares every other node, edge and data object with the snapshot before it.
- Undo restores identical objects, so the canvas cache, the validation cache ([ADR 0008](./0008-graph-validation.md)) and the properties form treat untouched parts as unchanged and do not recompute them.
- The history lives in memory only. Autosave keeps the document, not the history, so undo does not survive a reload. Replacing a non-empty document shows a toast with Undo, because nothing else keeps the replaced draft.
- **Collaboration (A9) needs another undo.** Restoring a snapshot would also revert other users' changes made in between. With Yjs, undo moves to `Y.UndoManager`, which tracks the origin of each change and undoes only the local user's own. Commands, labels and merge keys stay; the snapshot history goes.

## Alternatives considered

- **Inverse commands (the classic GoF command with `undo()`)** — stores only deltas, and collaboration needs this kind of undo. But every command needs a correct inverse (a removal must restore the removed edges in order, a connection the edge it replaced). That is more code and a common source of bugs, while snapshots cost little thanks to structural sharing.
- **zundo or another zustand middleware** — ties the history to the store library, records view state (selection, drag positions) unless filtered out, and cannot label or merge changes by what they mean.
- **Deep copies of the document** — simple, but memory grows with the document size times the history length, and restored objects lose their identity, so every cache recomputes after an undo.
