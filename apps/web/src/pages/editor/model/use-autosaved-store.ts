import { useEffect, useRef, useState } from 'react';

import {
  createBlankPipeline,
  createPipelineStore,
  type DraftLoadResult,
  type DraftSaveError,
  loadDraft,
  startAutosave,
} from '@/entities/pipeline';
import { type ToastOptions, useToast } from '@/shared/ui/toast';

/**
 * The editor's store. It starts from the autosaved draft, as its initial state rather than an undo
 * step, and saves the pipeline as it changes. A draft that cannot be read or loads only with
 * repairs, and the first save that fails, are reported with a toast.
 */
export function useAutosavedStore() {
  const [{ store, draft }] = useState(restore);
  const { toast } = useToast();
  // Refs outlive StrictMode's second run of the effect, so each problem is reported once.
  const reportedRef = useRef({ draft: false, failedSave: false });

  useEffect(() => {
    const draftProblem = draftToast(draft);
    if (draftProblem !== null && !reportedRef.current.draft) {
      reportedRef.current.draft = true;
      toast(draftProblem);
    }
    return startAutosave(store, {
      onError: (error) => {
        // Later saves keep trying; telling the user once per session is enough.
        if (reportedRef.current.failedSave) return;
        reportedRef.current.failedSave = true;
        toast(failedSaveToast(error));
      },
    });
  }, [store, draft, toast]);

  return store;
}

// StrictMode calls this twice and keeps the first result; the second call finds an unreadable
// draft already moved aside.
function restore() {
  const draft = loadDraft();
  const pipeline = draft.status === 'restored' ? draft.pipeline : createBlankPipeline('draft');
  return { store: createPipelineStore(pipeline), draft };
}

/** What to tell the user about the draft the editor started from, if anything. */
function draftToast(draft: DraftLoadResult): ToastOptions | null {
  switch (draft.status) {
    case 'empty':
      return null;
    case 'restored':
      return draft.repairs.length > 0
        ? repairedDraftToast(draft.repairs.length, draft.backedUp)
        : null;
    case 'unreadable':
      return unreadableDraftToast(draft.backedUp);
  }
}

// These toasts stay until dismissed: the user should not miss that work may be lost.

// The parser drops edges the editor could not show or keep (ADR 0010). They cannot be brought back
// in the app, but the copy keeps them for anyone who looks into storage.
function repairedDraftToast(count: number, backedUp: boolean): ToastOptions {
  const removed =
    count === 1
      ? '1 connection in your last pipeline pointed at a missing node or an occupied input.'
      : `${String(count)} connections in your last pipeline pointed at missing nodes or occupied inputs.`;
  return {
    title: count === 1 ? 'A connection was removed' : 'Some connections were removed',
    description: backedUp
      ? `${removed} A copy of the saved data was kept in this browser.`
      : removed,
    tone: 'neutral',
    duration: Infinity,
  };
}

function unreadableDraftToast(backedUp: boolean): ToastOptions {
  return {
    title: 'Couldn’t restore your last pipeline',
    description: backedUp
      ? 'A copy of the saved data was kept in this browser.'
      : 'Your next change will replace the saved data.',
    tone: 'danger',
    duration: Infinity,
  };
}

function failedSaveToast(error: DraftSaveError): ToastOptions {
  return {
    title: 'Couldn’t save your changes',
    description:
      error === 'quota-exceeded'
        ? 'Browser storage is full, so changes are no longer saved in this browser.'
        : 'This browser blocks storage, so changes are lost when the page closes.',
    tone: 'danger',
    duration: Infinity,
  };
}
