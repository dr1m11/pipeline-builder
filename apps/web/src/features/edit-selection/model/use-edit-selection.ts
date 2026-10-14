import {
  extractFragment,
  instantiateFragment,
  parsePipelineFile,
  serializePipeline,
} from '@pipeline-builder/core';
import { useEffect, useEffectEvent, useRef } from 'react';

import { usePipelineStoreApi } from '@/entities/pipeline';
import { ownsKeys, useShortcuts } from '@/shared/lib/keyboard';
import { useToast } from '@/shared/ui/toast';

import {
  CLEAR_SELECTION_SHORTCUT,
  DUPLICATE_SHORTCUT,
  SELECT_ALL_SHORTCUT,
} from '../config/shortcuts';
import {
  COPY_OFFSET,
  nextPaste,
  NO_PASTES,
  type PasteCascade,
  startCascade,
} from '../lib/paste-cascade';
import { pasteErrorToast } from '../lib/paste-error';

const createId = () => crypto.randomUUID();

// Safari runs Copy, Cut and Paste outside text only when the page cancels these events to say it
// handles them. Chrome merely enables its menu items then, and Firefox does not fire them.
const BEFORE_CLIPBOARD_EVENTS = ['beforecopy', 'beforecut', 'beforepaste'] as const;

/**
 * Copy, cut, paste, duplicate and select all for the pipeline of the surrounding editor.
 *
 * Ctrl/⌘+C, X and V work through the clipboard events the browser fires for them, so no clipboard
 * permission is asked: the selected nodes and the edges between them go to the clipboard as the
 * text of a pipeline file, and pasting a pipeline (a copy from any tab or an exported file) adds
 * its nodes with fresh ids, a little further from the originals on each paste. Text fields,
 * dialogs, menus and selected text keep the browser's clipboard. Ctrl/⌘+D duplicates the selected
 * nodes, Ctrl/⌘+A selects every node and edge, and Escape clears the selection. Every change of the
 * pipeline is one undo step.
 */
export function useEditSelection(): void {
  const store = usePipelineStoreApi();
  const { toast } = useToast();
  // Pastes in a row of one pipeline. It is known by its text as `serializePipeline` writes it, not
  // as the clipboard gives it back, which may have other line ends (Windows).
  const cascadeRef = useRef<PasteCascade>(NO_PASTES);

  const onCopyOrCut = useEffectEvent((event: ClipboardEvent) => {
    const { clipboardData } = event;
    if (clipboardData === null || !isForEditor(event)) return;
    const { pipeline, selectedNodeIds, selectedEdgeIds, removeElements } = store.getState();
    if (selectedNodeIds.size === 0) return;
    const text = serializePipeline(extractFragment(pipeline, selectedNodeIds));
    clipboardData.setData('text/plain', text);
    event.preventDefault();
    cascadeRef.current = startCascade(text);
    if (event.type === 'cut') {
      removeElements({ nodeIds: [...selectedNodeIds], edgeIds: [...selectedEdgeIds] }, 'cut');
    }
  });

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const { clipboardData } = event;
    if (clipboardData === null || !isForEditor(event)) return;
    const parsed = parsePipelineFile(clipboardData.getData('text/plain'));
    if (!parsed.ok) {
      const notice = pasteErrorToast(parsed.error);
      if (notice === null) return;
      event.preventDefault();
      toast(notice);
      return;
    }
    event.preventDefault();
    const fragment = parsed.value.pipeline;
    const paste = nextPaste(cascadeRef.current, serializePipeline(fragment));
    cascadeRef.current = paste.cascade;
    const { pipeline, insertElements } = store.getState();
    insertElements(
      instantiateFragment(fragment, pipeline, { createId, offset: paste.offset }),
      'paste',
    );
  });

  const onBeforeClipboard = useEffectEvent((event: Event) => {
    if (!isForEditor(event)) return;
    if (event.type === 'beforepaste' || store.getState().selectedNodeIds.size > 0) {
      event.preventDefault();
    }
  });

  useEffect(() => {
    const copyOrCut = (event: ClipboardEvent) => {
      onCopyOrCut(event);
    };
    const paste = (event: ClipboardEvent) => {
      onPaste(event);
    };
    const beforeClipboard = (event: Event) => {
      onBeforeClipboard(event);
    };
    document.addEventListener('copy', copyOrCut);
    document.addEventListener('cut', copyOrCut);
    document.addEventListener('paste', paste);
    for (const type of BEFORE_CLIPBOARD_EVENTS) document.addEventListener(type, beforeClipboard);
    return () => {
      document.removeEventListener('copy', copyOrCut);
      document.removeEventListener('cut', copyOrCut);
      document.removeEventListener('paste', paste);
      for (const type of BEFORE_CLIPBOARD_EVENTS) {
        document.removeEventListener(type, beforeClipboard);
      }
    };
  }, []);

  useShortcuts([
    {
      ...DUPLICATE_SHORTCUT,
      handler: () => {
        const { pipeline, selectedNodeIds, insertElements } = store.getState();
        if (selectedNodeIds.size === 0) return;
        const offset = { x: COPY_OFFSET, y: COPY_OFFSET };
        const fragment = extractFragment(pipeline, selectedNodeIds);
        insertElements(instantiateFragment(fragment, pipeline, { createId, offset }), 'duplicate');
      },
    },
    {
      ...SELECT_ALL_SHORTCUT,
      handler: () => {
        store.getState().selectAll();
      },
    },
    {
      ...CLEAR_SELECTION_SHORTCUT,
      handler: () => {
        store.getState().clearSelection();
      },
    },
  ]);
}

/**
 * Whether a clipboard event is the editor's to handle: nothing has handled it yet, neither its
 * target nor the focus is in an element that keeps its keys (a text field, a dialog, a menu), and
 * no text is selected on the page, which is what the user copies then. Browsers aim the event at
 * the focused element or at the selected text, so both are checked.
 */
function isForEditor(event: Event): boolean {
  if (event.defaultPrevented || ownsKeys(event.target) || ownsKeys(document.activeElement)) {
    return false;
  }
  const selection = document.getSelection();
  return selection === null || selection.isCollapsed;
}
