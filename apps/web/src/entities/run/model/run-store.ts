import type { RunEvent } from '@pipeline-builder/core';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { applyRunEvents, IDLE_RUN, type RunState } from './run-state';

/** How a run starts. */
export interface RunStartOptions {
  /** Whether it goes step by step (see `RunState.stepping`); not by default. */
  readonly stepping?: boolean;
}

/** Store actions. Each one leaves the state untouched, and notifies nobody, when nothing changes. */
export interface RunActions {
  /** Forgets the last run and marks a new one as running, with no node reported yet. */
  start: (options?: RunStartOptions) => void;
  /**
   * Applies events of the run in progress, in order, as one change (see `applyRunEvents`). Events
   * arriving when no run is in progress are ignored.
   */
  applyEvents: (events: readonly RunEvent[]) => void;
  /**
   * Makes the run in progress go step by step, or not; a run that stops stepping is no longer
   * paused. Ignored when no run is in progress.
   */
  setStepping: (stepping: boolean) => void;
  /**
   * Marks the run in progress as paused before the node `nodeId`, or as no longer paused with
   * null. Only a run that goes step by step pauses: ignored otherwise.
   */
  setPausedNode: (nodeId: string | null) => void;
  /** Forgets the run: every node is idle again. */
  reset: () => void;
}

export type RunStore = StoreApi<RunState & RunActions>;

/**
 * Creates the store of an editor's run: the run's status, the state of each node, fed by the
 * events of the engine (`runPipeline`), and where a step-by-step run is paused. It holds view state
 * only: it is never saved and never enters the undo history. The run itself (the engine, its abort
 * controller, what lets a paused run go on) belongs to whoever calls `start`.
 */
export function createRunStore(): RunStore {
  return createStore<RunState & RunActions>()((set, get) => ({
    ...IDLE_RUN,

    start: ({ stepping = false } = {}) => {
      set({ status: 'running', nodes: new Map(), stepping, pausedNodeId: null });
    },

    applyEvents: (events) => {
      const state = get();
      const next = applyRunEvents(state, events);
      if (next !== state) set(next);
    },

    setStepping: (stepping) => {
      const state = get();
      if (state.status !== 'running' || state.stepping === stepping) return;
      set(stepping ? { stepping } : { stepping, pausedNodeId: null });
    },

    setPausedNode: (nodeId) => {
      const state = get();
      if (state.status !== 'running' || !state.stepping || state.pausedNodeId === nodeId) return;
      set({ pausedNodeId: nodeId });
    },

    reset: () => {
      const { status, nodes } = get();
      if (status === 'idle' && nodes.size === 0) return;
      set(IDLE_RUN);
    },
  }));
}
