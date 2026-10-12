import type { ReactNode } from 'react';

import type { PipelineStore } from './pipeline-store';
import { PipelineStoreContext } from './store-context';

export interface PipelineStoreProviderProps {
  store: PipelineStore;
  children: ReactNode;
}

/** Makes a pipeline store available to `usePipelineStore` below it. */
export function PipelineStoreProvider({ store, children }: PipelineStoreProviderProps) {
  return <PipelineStoreContext value={store}>{children}</PipelineStoreContext>;
}
