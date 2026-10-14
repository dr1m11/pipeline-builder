import { type DraftSaveError, saveDraft } from '../api/draft-storage';
import type { PipelineStore } from './pipeline-store';

export interface AutosaveOptions {
  /** Where to save; `localStorage` by default. */
  readonly storage?: Storage | null;
  /** How long changes must pause before they are saved, in milliseconds; 300 by default. */
  readonly delayMs?: number;
  /** Called each time a save fails. */
  readonly onError?: (error: DraftSaveError) => void;
}

/**
 * Saves the pipeline of `store` as the draft when it changes: once changes pause for `delayMs`, and
 * at once when the page is hidden or closed, as the browser may not run timers after that. Only the
 * document is saved; selection, sizes and anything else beside it never trigger a save.
 *
 * Returns a function that stops saving. A change still waiting is dropped then: the editor stops
 * when it unmounts, which may be an error boundary taking over from a broken state.
 */
export function startAutosave(
  store: PipelineStore,
  { storage, delayMs = 300, onError }: AutosaveOptions = {},
): () => void {
  let saved = store.getState().pipeline;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = () => {
    clearTimeout(timer);
    timer = undefined;
    const { pipeline } = store.getState();
    if (pipeline === saved) return;
    saved = pipeline;
    const result = saveDraft(pipeline, storage);
    if (!result.ok) onError?.(result.error);
  };
  const saveIfHidden = () => {
    if (document.visibilityState === 'hidden') save();
  };

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.pipeline === previous.pipeline) return;
    clearTimeout(timer);
    timer = setTimeout(save, delayMs);
  });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', saveIfHidden);

  return () => {
    unsubscribe();
    clearTimeout(timer);
    window.removeEventListener('pagehide', save);
    document.removeEventListener('visibilitychange', saveIfHidden);
  };
}
