import {
  type ConnectionCandidate,
  createHistoryEntry,
  EMPTY_HISTORY,
  executeCommand,
  findNode,
  type History,
  type HistoryStep,
  type NodeKind,
  type Pipeline,
  type PipelineCommand,
  type PipelineNode,
  type Position,
  recordChange,
  redoChange,
  undoChange,
  validateConnection,
} from '@pipeline-builder/core';
import { createStore, type StoreApi } from 'zustand/vanilla';

/** Rendered size of a node, as measured by the canvas. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Selected flags by element id: `true` selects the element, `false` deselects it. */
export interface SelectionChanges {
  readonly nodes?: ReadonlyMap<string, boolean>;
  readonly edges?: ReadonlyMap<string, boolean>;
}

/** Ids of nodes and edges. */
export interface ElementIds {
  readonly nodeIds?: readonly string[];
  readonly edgeIds?: readonly string[];
}

/** State of the canvas kept beside the document. It is never saved and never enters the history. */
interface ViewState {
  readonly selectedNodeIds: ReadonlySet<string>;
  readonly selectedEdgeIds: ReadonlySet<string>;
  /** Rendered node sizes, reported by the canvas. */
  readonly measured: ReadonlyMap<string, Size>;
  /** Where dragged nodes are now; the pipeline gets their positions on drop. */
  readonly dragPositions: ReadonlyMap<string, Position>;
}

export interface PipelineState extends ViewState {
  /** The document: the only part that is saved, validated, run and undone. */
  readonly pipeline: Pipeline;
  /** Changes of the pipeline that can be undone and redone (see docs/adr/0009). */
  readonly history: History;
}

/**
 * Store actions. Each one leaves the state untouched, and notifies nobody, when nothing changes.
 * View state is kept only for elements of the pipeline: ids it does not contain are ignored, and
 * the view state of elements that a change, an undo or a redo takes away is dropped.
 */
export interface PipelineActions {
  /** Adds a node of `kind` with the next free label and returns it. */
  addNode: (kind: NodeKind, position: Position) => PipelineNode;
  /** Records where dragged nodes are, without changing the pipeline. */
  dragNodes: (positions: ReadonlyMap<string, Position>) => void;
  /** Moves nodes in the pipeline and ends their drag. */
  moveNodes: (positions: ReadonlyMap<string, Position>) => void;
  /** Removes nodes and edges, with every edge of a removed node, and forgets their view state. */
  removeElements: (ids: ElementIds) => void;
  /** Whether an output may be connected to an input; an occupied input may be. */
  canConnect: (candidate: ConnectionCandidate) => boolean;
  /** Connects an output to an input, replacing the edge that occupied the input. */
  connect: (candidate: ConnectionCandidate) => void;
  /**
   * Changes fields of a node's data. Changes that do not fit the kind's data (an unknown field, a
   * value of the wrong type) are ignored; values that only break a rule are kept for validation.
   */
  updateNodeData: (nodeId: string, changes: Readonly<Record<string, unknown>>) => void;
  /** Renames a node; the label is trimmed, and a blank or too long label is ignored. */
  renameNode: (nodeId: string, label: string) => void;
  /** Reverts the last change of the pipeline. Ignored while nodes are dragged. */
  undo: () => void;
  /** Applies the last undone change again. Ignored while nodes are dragged. */
  redo: () => void;
  updateSelection: (changes: SelectionChanges) => void;
  /** Makes these elements, and only these, the selection. */
  select: (ids: ElementIds) => void;
  setMeasured: (sizes: ReadonlyMap<string, Size>) => void;
}

export type PipelineStore = StoreApi<PipelineState & PipelineActions>;

export interface PipelineStoreOptions {
  /** Generates ids for new nodes and edges; random UUIDs by default. */
  readonly createId?: () => string;
  /** Current time in ms, which decides what merges in the history; `Date.now()` by default. */
  readonly now?: () => number;
}

/**
 * Creates the store that holds a pipeline being edited. Every change of the pipeline is a core
 * command that goes through one path, which records it in the history (see docs/adr/0009);
 * selection, sizes and drag positions are view state kept beside it.
 */
export function createPipelineStore(
  pipeline: Pipeline,
  { createId = () => crypto.randomUUID(), now = () => Date.now() }: PipelineStoreOptions = {},
): PipelineStore {
  return createStore<PipelineState & PipelineActions>()((set, get) => {
    /**
     * Executes `command`, records it in the history and applies `view` along with it. A command
     * that fails or changes nothing changes no state. Returns whether the pipeline changed.
     */
    const execute = (command: PipelineCommand, view: Partial<ViewState> = {}): boolean => {
      const state = get();
      const result = executeCommand(state.pipeline, command);
      if (!result.ok || result.value === state.pipeline) return false;
      const next = result.value;
      const entry = createHistoryEntry(command, { before: state.pipeline, after: next, at: now() });
      set({
        pipeline: next,
        history: recordChange(state.history, entry),
        ...pruneViewState({ ...state, ...view }, next),
      });
      return true;
    };

    /** Shows the document of an undo or a redo and keeps the history it leaves. */
    const applyStep = (step: HistoryStep | null): void => {
      if (step === null) return;
      set({
        pipeline: step.pipeline,
        history: step.history,
        ...pruneViewState(get(), step.pipeline),
      });
    };

    return {
      pipeline,
      history: EMPTY_HISTORY,
      selectedNodeIds: new Set(),
      selectedEdgeIds: new Set(),
      measured: new Map(),
      dragPositions: new Map(),

      addNode: (kind, position) => {
        const id = createId();
        execute({ type: 'add-node', id, kind, position });
        const node = findNode(get().pipeline, id);
        if (node === undefined) throw new Error(`Node ${id} was not added`);
        return node;
      },

      dragNodes: (positions) => {
        const state = get();
        const changed = [...positions].filter(
          ([id, position]) =>
            findNode(state.pipeline, id) !== undefined &&
            !samePosition(state.dragPositions.get(id), position),
        );
        if (changed.length === 0) return;
        set({ dragPositions: new Map([...state.dragPositions, ...changed]) });
      },

      moveNodes: (positions) => {
        const { dragPositions } = get();
        const remaining = filterKeys(dragPositions, (id) => !positions.has(id));
        const moved = execute({ type: 'move-nodes', positions }, { dragPositions: remaining });
        // A drag that ends where it started changes nothing in the document, but it still ends.
        if (!moved && remaining !== dragPositions) set({ dragPositions: remaining });
      },

      removeElements: (ids) => {
        execute({ type: 'remove-elements', ...ids });
      },

      canConnect: (candidate) => validateConnection(get().pipeline, candidate).ok,

      connect: (candidate) => {
        execute({ type: 'connect', candidate, edgeId: createId() });
      },

      updateNodeData: (nodeId, changes) => {
        execute({ type: 'update-node-data', nodeId, changes });
      },

      renameNode: (nodeId, label) => {
        execute({ type: 'rename-node', nodeId, label });
      },

      // Never during a drag: its drop would then move nodes of a document that is no longer shown.
      undo: () => {
        const state = get();
        if (state.dragPositions.size === 0) applyStep(undoChange(state.history));
      },

      redo: () => {
        const state = get();
        if (state.dragPositions.size === 0) applyStep(redoChange(state.history));
      },

      updateSelection: (changes) => {
        const state = get();
        const { pipeline: current } = state;
        const selectedNodeIds = applySelection(
          state.selectedNodeIds,
          changes.nodes,
          (id) => findNode(current, id) !== undefined,
        );
        const selectedEdgeIds = applySelection(state.selectedEdgeIds, changes.edges, (id) =>
          current.edges.some((edge) => edge.id === id),
        );
        if (
          selectedNodeIds === state.selectedNodeIds &&
          selectedEdgeIds === state.selectedEdgeIds
        ) {
          return;
        }
        set({ selectedNodeIds, selectedEdgeIds });
      },

      select: ({ nodeIds = [], edgeIds = [] }) => {
        const state = get();
        const { pipeline: current } = state;
        const selectedNodeIds = replaceSet(
          state.selectedNodeIds,
          nodeIds.filter((id) => findNode(current, id) !== undefined),
        );
        const selectedEdgeIds = replaceSet(
          state.selectedEdgeIds,
          edgeIds.filter((id) => current.edges.some((edge) => edge.id === id)),
        );
        if (
          selectedNodeIds === state.selectedNodeIds &&
          selectedEdgeIds === state.selectedEdgeIds
        ) {
          return;
        }
        set({ selectedNodeIds, selectedEdgeIds });
      },

      setMeasured: (sizes) => {
        const { pipeline: current, measured } = get();
        const changed = [...sizes].filter(([id, size]) => {
          const known = measured.get(id);
          return (
            findNode(current, id) !== undefined &&
            (known?.width !== size.width || known.height !== size.height)
          );
        });
        if (changed.length === 0) return;
        set({ measured: new Map([...measured, ...changed]) });
      },
    };
  });
}

/**
 * Drops the view state of elements that `pipeline` does not have. A part that loses nothing is
 * returned as it is, so components that select it do not re-render.
 */
function pruneViewState(view: ViewState, pipeline: Pipeline): ViewState {
  const nodeIds = new Set(pipeline.nodes.map((node) => node.id));
  const edgeIds = new Set(pipeline.edges.map((edge) => edge.id));
  return {
    selectedNodeIds: filterSet(view.selectedNodeIds, (id) => nodeIds.has(id)),
    selectedEdgeIds: filterSet(view.selectedEdgeIds, (id) => edgeIds.has(id)),
    measured: filterKeys(view.measured, (id) => nodeIds.has(id)),
    dragPositions: filterKeys(view.dragPositions, (id) => nodeIds.has(id)),
  };
}

/**
 * Returns `selected` with the changes applied, or `selected` itself when they change nothing.
 * Only ids that `exists` accepts can be selected.
 */
function applySelection(
  selected: ReadonlySet<string>,
  changes: ReadonlyMap<string, boolean> | undefined,
  exists: (id: string) => boolean,
): ReadonlySet<string> {
  if (changes === undefined) return selected;
  const effective = [...changes].filter(
    ([id, isSelected]) => selected.has(id) !== isSelected && (!isSelected || exists(id)),
  );
  if (effective.length === 0) return selected;
  const next = new Set(selected);
  for (const [id, isSelected] of effective) {
    if (isSelected) next.add(id);
    else next.delete(id);
  }
  return next;
}

/** A set of `ids`, or `current` itself when it holds exactly those ids. */
function replaceSet(current: ReadonlySet<string>, ids: readonly string[]): ReadonlySet<string> {
  const next = new Set(ids);
  const same = next.size === current.size && [...next].every((id) => current.has(id));
  return same ? current : next;
}

function samePosition(a: Position | undefined, b: Position): boolean {
  return a?.x === b.x && a.y === b.y;
}

/** Keeps the entries whose key passes `keep`; returns `map` itself when it keeps them all. */
function filterKeys<V>(
  map: ReadonlyMap<string, V>,
  keep: (id: string) => boolean,
): ReadonlyMap<string, V> {
  const entries = [...map].filter(([id]) => keep(id));
  return entries.length === map.size ? map : new Map(entries);
}

/** Keeps the ids that pass `keep`; returns `set` itself when it keeps them all. */
function filterSet(set: ReadonlySet<string>, keep: (id: string) => boolean): ReadonlySet<string> {
  const ids = [...set].filter(keep);
  return ids.length === set.size ? set : new Set(ids);
}
