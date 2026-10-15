import type { NodeRunStatus } from '@pipeline-builder/core';
import { createContext, use } from 'react';
import { useStore } from 'zustand';

import { type EdgeEnds, type EdgeFlow, edgeFlow } from './edge-flow';
import { IDLE_NODE_RUN, type NodeRunState, type RunState } from './run-state';
import type { RunActions, RunStore } from './run-store';

export const RunStoreContext = createContext<RunStore | null>(null);

/** The store of the surrounding `RunStoreProvider`, for reading state inside event handlers. */
export function useRunStoreApi(): RunStore {
  const store = use(RunStoreContext);
  if (store === null) throw new Error('The run store is used outside RunStoreProvider');
  return store;
}

/**
 * Selects a value from the run store and re-renders when it changes (by `Object.is`). Select
 * stable values: a selector that builds a new array or object on every call loops.
 */
export function useRunStore<T>(selector: (state: RunState & RunActions) => T): T {
  return useStore(useRunStoreApi(), selector);
}

/**
 * What the current run did to the node `nodeId` (`IDLE_NODE_RUN` when the run has not reported
 * it). The component re-renders only when this node's state changes, however often others change.
 */
export function useNodeRun(nodeId: string): NodeRunState {
  return useRunStore((state) => state.nodes.get(nodeId) ?? IDLE_NODE_RUN);
}

/**
 * The run status of the node `nodeId` (`idle` when the run has not reported it). Unlike
 * `useNodeRun`, the component does not re-render while the node streams its response.
 */
export function useNodeRunStatus(nodeId: string): NodeRunStatus {
  return useRunStore((state) => state.nodes.get(nodeId)?.status ?? 'idle');
}

/**
 * Whether a step-by-step run is paused before the node `nodeId`: it is the next one to run. The
 * component re-renders only when that changes.
 */
export function useIsPausedBefore(nodeId: string): boolean {
  return useRunStore((state) => state.pausedNodeId === nodeId);
}

/**
 * What the current run did with an edge (see `EdgeFlow`). The component re-renders only when that
 * changes, not on every token the run streams.
 */
export function useEdgeFlow(ends: EdgeEnds): EdgeFlow {
  return useRunStore((state) => edgeFlow(state, ends));
}
