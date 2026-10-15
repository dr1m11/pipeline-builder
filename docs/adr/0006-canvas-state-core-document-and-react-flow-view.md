# 0006. Canvas state: core document, React Flow view

- Status: Accepted
- Date: 2026-10-13

## Context

Stage A2 puts the pipeline on a React Flow canvas ([#23](https://github.com/dr1m11/pipeline-builder/issues/23)). React Flow can own its nodes and edges (`useNodesState`) or render what it is given and report changes (controlled flow). The graph must stay a core `Pipeline`: validation (A3), undo/redo, autosave and import/export (A4), execution (A5) and collaboration (A9) work on it, and core cannot depend on React Flow. The canvas also needs state the document has no place for: selection, measured node sizes and positions during a drag.

## Decision

The core `Pipeline` is the single source of truth. It lives in a zustand store in `entities/pipeline`, next to view state (selected node and edge ids, measured sizes, drag positions), and changes only through core operations. React Flow is a controlled view: the `pipeline-canvas` widget derives nodes and edges from the store and translates React Flow changes into store actions.

1. **Derived nodes carry `selected`, `measured` and `dragging`.** Without `measured` React Flow hides a node until it measures it again, and it does so for every new node object; a dragged node is a new object on every frame. `width` and `height` are not set.
2. **Derived objects are cached per domain object** (a `WeakMap`) and reused while their selection, size and drag position are unchanged, so a store update re-renders only the nodes it touched. Derivation runs in `useMemo` over stable store slices, never in a selector that builds a new array (an endless render loop in zustand 5).
3. **A drag stays out of the pipeline.** Changes with `dragging: true` only update drag positions; the final change (`dragging: false`, also sent for arrow-key moves) is one `moveNodes`. Validation, history, autosave and collaboration see one change per drop.
4. **Deletion goes through `onDelete`** as one `removeElements`, which also removes the edges of deleted nodes; `remove` changes are ignored. Delete and Backspace both delete.
5. **Never edit React Flow's copy.** `useReactFlow().setNodes`, `addNodes`, `updateNode*` and their edge counterparts produce `add`/`replace` changes, which the adapters ignore, so the edit would be lost. Elements are added and edited through the store.
6. **Core keeps identities.** Operations keep unchanged nodes and edges identical and return the same pipeline when nothing changes. The cache (rule 2) and the store, which notifies nobody when an action changes nothing, rely on this; core tests cover it.
7. **One store per editor.** `createPipelineStore(pipeline)` builds a store and `PipelineStoreProvider` provides it; the app generates ids and passes them to core.
8. **A run stays beside the canvas, never in it** (added in A5, [#84](https://github.com/dr1m11/pipeline-builder/issues/84) and [#85](https://github.com/dr1m11/pipeline-builder/issues/85)). The run of a pipeline is view state in a store of its own per editor (`entities/run`): never saved, never in the history, cleared when the next run starts or the document is replaced. The run feature applies the engine's events ([ADR 0011](./0011-pipeline-execution-engine.md)) to it at most once per animation frame, and a run's end at once. React Flow node and edge objects carry no run state, so the cache of rule 2 is untouched by a run. The canvas widget composes the run's components into each node card through `NodeRunSlots` (status, result, a line of description, dimmed), since entities do not import each other; the components read the run store by node id, so a streamed token re-renders the text of its own node only. React Flow's `default` edge type is replaced by `CanvasEdge`: the same bezier path, with a class for the data the run carried along the edge, read by the edge's ends.

## Consequences

- Every later stage reads and changes one document; undo (A4) can keep pipeline snapshots, and selection, sizes and drag positions stay out of history and saved files.
- The store and the change adapters are tested without a browser; canvas gestures are tested in Storybook (real browser) and Playwright.
- Each new kind of React Flow interaction needs an adapter. Features that change React Flow's own nodes (resizing with `NodeResizer`, sub-flows) need explicit support.
- A run costs the canvas one re-render per token, of one component, whatever the size of the pipeline (tested with 50 nodes). Run UI on a node is added through `NodeRunSlots`, and edge styles through `CanvasEdge`, rather than through the derived objects.
- To watch: derivation cost with hundreds of nodes (A6, where `onlyRenderVisibleElements` uses `dragging`); handle positions when a node's ports change need `useUpdateNodeInternals` (A3).

## Alternatives considered

- **React Flow owns the graph (`useNodesState`), synced to core** — two copies of the graph that can drift, and every core operation needs a round trip.
- **React Flow nodes stored in the store** — ties the document to a rendering library; core could no longer own the graph.
- **Commit every drag frame to the pipeline** — simpler, but validation, history and autosave would run on every pointer move.
- **A module-level store** — less code, but stories and tests would share state, and A4 needs a store per loaded document (refined in [0009](./0009-undo-redo-commands-with-snapshot-history.md): one store per editor, whose document is replaced by an undoable command).
