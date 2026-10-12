import { createContext, use } from 'react';
import { useStore } from 'zustand';

import type { PipelineActions, PipelineState, PipelineStore } from './pipeline-store';

export const PipelineStoreContext = createContext<PipelineStore | null>(null);

/** The store of the surrounding `PipelineStoreProvider`, for reading state inside event handlers. */
export function usePipelineStoreApi(): PipelineStore {
  const store = use(PipelineStoreContext);
  if (store === null) throw new Error('The pipeline store is used outside PipelineStoreProvider');
  return store;
}

/**
 * Selects a value from the pipeline store and re-renders when it changes (by `Object.is`).
 * Select stable values: a selector that builds a new array or object on every call loops.
 */
export function usePipelineStore<T>(selector: (state: PipelineState & PipelineActions) => T): T {
  return useStore(usePipelineStoreApi(), selector);
}
