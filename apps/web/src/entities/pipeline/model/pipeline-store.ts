import {
  addNode,
  connect,
  type ConnectionCandidate,
  findNode,
  moveNodes,
  type NodeKind,
  type Pipeline,
  type PipelineNode,
  type Position,
  removeElements,
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

/** Ids of the nodes and edges to remove. */
export interface ElementIds {
  readonly nodeIds?: readonly string[];
  readonly edgeIds?: readonly string[];
}

export interface PipelineState {
  /** The document: the only part that is saved, validated and run. */
  readonly pipeline: Pipeline;
  readonly selectedNodeIds: ReadonlySet<string>;
  readonly selectedEdgeIds: ReadonlySet<string>;
  /** Rendered node sizes, reported by the canvas. */
  readonly measured: ReadonlyMap<string, Size>;
  /** Where dragged nodes are now; the pipeline gets their positions on drop. */
  readonly dragPositions: ReadonlyMap<string, Position>;
}

/**
 * Store actions. Each one leaves the state untouched, and notifies nobody, when nothing changes.
 * View state is kept only for elements of the pipeline: ids it does not contain are ignored.
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
  updateSelection: (changes: SelectionChanges) => void;
  setMeasured: (sizes: ReadonlyMap<string, Size>) => void;
}

export type PipelineStore = StoreApi<PipelineState & PipelineActions>;

export interface PipelineStoreOptions {
  /** Generates ids for new nodes and edges; random UUIDs by default. */
  readonly createId?: () => string;
}

/**
 * Creates the store that holds a pipeline being edited. The pipeline changes only through core
 * operations; selection, sizes and drag positions are view state kept beside it.
 */
export function createPipelineStore(
  pipeline: Pipeline,
  { createId = () => crypto.randomUUID() }: PipelineStoreOptions = {},
): PipelineStore {
  return createStore<PipelineState & PipelineActions>()((set, get) => ({
    pipeline,
    selectedNodeIds: new Set(),
    selectedEdgeIds: new Set(),
    measured: new Map(),
    dragPositions: new Map(),

    addNode: (kind, position) => {
      const result = addNode(get().pipeline, { kind, id: createId(), position });
      set({ pipeline: result.pipeline });
      return result.node;
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
      const state = get();
      const next = moveNodes(state.pipeline, positions);
      const dragPositions = filterKeys(state.dragPositions, (id) => !positions.has(id));
      if (next === state.pipeline && dragPositions === state.dragPositions) return;
      set({ pipeline: next, dragPositions });
    },

    removeElements: (ids) => {
      const state = get();
      const next = removeElements(state.pipeline, ids);
      if (next === state.pipeline) return;
      const nodeIds = new Set(next.nodes.map((node) => node.id));
      const edgeIds = new Set(next.edges.map((edge) => edge.id));
      set({
        pipeline: next,
        selectedNodeIds: filterSet(state.selectedNodeIds, (id) => nodeIds.has(id)),
        selectedEdgeIds: filterSet(state.selectedEdgeIds, (id) => edgeIds.has(id)),
        measured: filterKeys(state.measured, (id) => nodeIds.has(id)),
        dragPositions: filterKeys(state.dragPositions, (id) => nodeIds.has(id)),
      });
    },

    canConnect: (candidate) => validateConnection(get().pipeline, candidate).ok,

    connect: (candidate) => {
      const state = get();
      const result = connect(state.pipeline, candidate, createId());
      if (!result.ok || result.value.pipeline === state.pipeline) return;
      const { pipeline: next, replacedEdge } = result.value;
      set({
        pipeline: next,
        selectedEdgeIds:
          replacedEdge === null
            ? state.selectedEdgeIds
            : filterSet(state.selectedEdgeIds, (id) => id !== replacedEdge.id),
      });
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
      if (selectedNodeIds === state.selectedNodeIds && selectedEdgeIds === state.selectedEdgeIds) {
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
  }));
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
