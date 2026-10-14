import { createEmptyPipeline } from '@pipeline-builder/core';
import { useEffect, useRef, useState } from 'react';

import {
  createPipelineStore,
  type DraftSaveError,
  loadDraft,
  startAutosave,
} from '@/entities/pipeline';
import { type ToastOptions, useToast } from '@/shared/ui/toast';

/**
 * The editor's store. It starts from the autosaved draft, as its initial state rather than an undo
 * step, and saves the pipeline as it changes. A draft that cannot be read, and the first save that
 * fails, are reported with a toast.
 */
export function useAutosavedStore() {
  const [{ store, draft }] = useState(restore);
  const { toast } = useToast();
  // Refs outlive StrictMode's second run of the effect, so each problem is reported once.
  const reportedRef = useRef({ unreadableDraft: false, failedSave: false });

  useEffect(() => {
    if (draft.status === 'unreadable' && !reportedRef.current.unreadableDraft) {
      reportedRef.current.unreadableDraft = true;
      toast(unreadableDraftToast(draft.backedUp));
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
  const pipeline =
    draft.status === 'restored'
      ? draft.pipeline
      : createEmptyPipeline({ id: 'draft', name: 'Untitled pipeline' });
  return { store: createPipelineStore(pipeline), draft };
}

// Both stay until dismissed: the user should not miss that work may be lost.
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
