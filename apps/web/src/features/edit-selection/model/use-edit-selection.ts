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

type ClipboardAction = 'copy' | 'cut' | 'paste';

const createId = () => crypto.randomUUID();

// Safari runs Copy, Cut and Paste outside text only when the page cancels these events to say it
// handles them. Chrome merely enables its menu items then, and Firefox does not fire them.
const BEFORE_CLIPBOARD_EVENTS = {
  beforecopy: 'copy',
  beforecut: 'cut',
  beforepaste: 'paste',
} as const satisfies Record<string, ClipboardAction>;

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
 *
 * Keys that change the selection (cut, paste, duplicate, select all, Escape) are left alone on a
 * select, a checkbox or a radio, where they would replace the Inspector's form under the focus.
 */
export function useEditSelection(): void {
  const store = usePipelineStoreApi();
  const { toast } = useToast();
  // Pastes in a row of one pipeline. It is known by its text as `serializePipeline` writes it, not
  // as the clipboard gives it back, which may have other line ends (Windows).
  const cascadeRef = useRef<PasteCascade>(NO_PASTES);

  /** Whether the editor takes this clipboard event for `action`, rather than the browser. */
  const takes = (event: Event, action: ClipboardAction): boolean => {
    if (!isForEditor(event)) return false;
    if (action !== 'copy' && inFormControl(event)) return false;
    return action === 'paste' || store.getState().selectedNodeIds.size > 0;
  };

  const onCopyOrCut = useEffectEvent((event: ClipboardEvent) => {
    const { clipboardData } = event;
    const action = event.type === 'cut' ? 'cut' : 'copy';
    if (clipboardData === null || !takes(event, action)) return;
    const { pipeline, selectedNodeIds, selectedEdgeIds, removeElements } = store.getState();
    const text = serializePipeline(extractFragment(pipeline, selectedNodeIds));
    clipboardData.setData('text/plain', text);
    event.preventDefault();
    cascadeRef.current = startCascade(text);
    if (action === 'cut') {
      removeElements({ nodeIds: [...selectedNodeIds], edgeIds: [...selectedEdgeIds] }, 'cut');
    }
  });

  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    const { clipboardData } = event;
    if (clipboardData === null || !takes(event, 'paste')) return;
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

  const onBeforeClipboard = useEffectEvent((event: Event, action: ClipboardAction) => {
    if (takes(event, action)) event.preventDefault();
  });

  useEffect(() => {
    const copyOrCut = (event: ClipboardEvent) => {
      onCopyOrCut(event);
    };
    const paste = (event: ClipboardEvent) => {
      onPaste(event);
    };
    const before = Object.entries(BEFORE_CLIPBOARD_EVENTS).map(
      ([type, action]) =>
        [
          type,
          (event: Event) => {
            onBeforeClipboard(event, action);
          },
        ] as const,
    );
    document.addEventListener('copy', copyOrCut);
    document.addEventListener('cut', copyOrCut);
    document.addEventListener('paste', paste);
    for (const [type, listener] of before) document.addEventListener(type, listener);
    return () => {
      document.removeEventListener('copy', copyOrCut);
      document.removeEventListener('cut', copyOrCut);
      document.removeEventListener('paste', paste);
      for (const [type, listener] of before) document.removeEventListener(type, listener);
    };
  }, []);

  const notOnFormControl = (event: KeyboardEvent) => !isFormControl(event.target);
  useShortcuts([
    {
      ...DUPLICATE_SHORTCUT,
      when: notOnFormControl,
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
      when: notOnFormControl,
      handler: () => {
        store.getState().selectAll();
      },
    },
    {
      ...CLEAR_SELECTION_SHORTCUT,
      when: notOnFormControl,
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

/**
 * Whether `target` is a form control that edits no text: a select, a checkbox, a radio (text
 * fields keep all their keys anyway). Keys pressed there must not change the selection: the
 * Inspector would show another form, and the focused control would go with the old one.
 */
function isFormControl(target: EventTarget | null): boolean {
  return target instanceof HTMLSelectElement || target instanceof HTMLInputElement;
}

/** Whether a clipboard event comes from, or happens while the focus is on, such a form control. */
function inFormControl(event: Event): boolean {
  return isFormControl(event.target) || isFormControl(document.activeElement);
}
