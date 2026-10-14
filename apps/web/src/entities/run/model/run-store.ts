import type { RunEvent } from '@pipeline-builder/core';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { applyRunEvents, IDLE_RUN, type RunState } from './run-state';

/** Store actions. Each one leaves the state untouched, and notifies nobody, when nothing changes. */
export interface RunActions {
  /** Forgets the last run and marks a new one as running, with no node reported yet. */
  start: () => void;
  /**
   * Applies events of the run in progress, in order, as one change (see `applyRunEvents`). Events
   * arriving when no run is in progress are ignored.
   */
  applyEvents: (events: readonly RunEvent[]) => void;
  /** Forgets the run: every node is idle again. */
  reset: () => void;
}

export type RunStore = StoreApi<RunState & RunActions>;

/**
 * Creates the store of an editor's run: the run's status and the state of each node, fed by the
 * events of the engine (`runPipeline`). It holds view state only: it is never saved and never
 * enters the undo history. The run itself (the engine, its abort controller) belongs to whoever
 * calls `start`.
 */
export function createRunStore(): RunStore {
  return createStore<RunState & RunActions>()((set, get) => ({
    ...IDLE_RUN,

    start: () => {
      set({ status: 'running', nodes: new Map() });
    },

    applyEvents: (events) => {
      const state = get();
      const next = applyRunEvents(state, events);
      if (next !== state) set(next);
    },

    reset: () => {
      const { status, nodes } = get();
      if (status === 'idle' && nodes.size === 0) return;
      set(IDLE_RUN);
    },
  }));
}
