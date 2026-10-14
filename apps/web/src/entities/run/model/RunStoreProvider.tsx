import type { ReactNode } from 'react';

import type { RunStore } from './run-store';
import { RunStoreContext } from './store-context';

export interface RunStoreProviderProps {
  store: RunStore;
  children: ReactNode;
}

/** Makes a run store available to `useRunStore` and `useNodeRun` below it. */
export function RunStoreProvider({ store, children }: RunStoreProviderProps) {
  return <RunStoreContext value={store}>{children}</RunStoreContext>;
}
