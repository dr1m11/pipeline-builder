import { useMemo } from 'react';

import { usePipelineStore } from './store-context';

/** What undo and redo would do now, as command labels ("Move 3 nodes"); null when nothing. */
export interface HistoryLabels {
  readonly undo: string | null;
  readonly redo: string | null;
}

/**
 * Labels of the next undo and redo in the surrounding store. Each is selected as a string, so the
 * component re-renders only when a label changes, and the result keeps its identity until then.
 */
export function useHistoryLabels(): HistoryLabels {
  const undo = usePipelineStore((state) => state.history.past.at(-1)?.label ?? null);
  const redo = usePipelineStore((state) => state.history.future[0]?.label ?? null);
  return useMemo(() => ({ undo, redo }), [undo, redo]);
}
