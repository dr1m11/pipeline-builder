import type { Pipeline, PipelineTemplate, ReplacePipelineCommand } from '@pipeline-builder/core';
import { useMemo, useState } from 'react';

import { usePipelineStoreApi } from '@/entities/pipeline';
import { isApplePlatform } from '@/shared/lib/keyboard';
import { useToast } from '@/shared/ui/toast';

import { blankPipeline, isBlankPipeline, pipelineFromTemplate } from '../lib/new-pipeline';
import { undoReplacementAltText } from '../lib/undo-alt-text';

/** Ways to start over in the surrounding pipeline store. */
export interface NewPipelineActions {
  /** Replaces the pipeline with a new one made from `template`, with fresh ids. */
  readonly loadTemplate: (template: PipelineTemplate) => void;
  /** Replaces the pipeline with a blank one; does nothing when it is blank already. */
  readonly startBlank: () => void;
}

const createId = () => crypto.randomUUID();

/**
 * Starts a new pipeline in place of the one being edited, as one undoable step; the canvas fits the
 * new one into view. Replacing a pipeline with nodes says so in a toast with Undo, because the
 * history lives in memory only and autosave overwrites the replaced draft (see docs/adr/0009);
 * screen readers hear the Ctrl+Z (⌘Z) shortcut instead.
 */
export function useNewPipeline(): NewPipelineActions {
  const store = usePipelineStoreApi();
  const { toast } = useToast();
  const [apple] = useState(() => isApplePlatform());

  return useMemo(() => {
    const replace = (
      next: Pipeline,
      reason: Exclude<ReplacePipelineCommand['reason'], 'import'>,
      title: string,
    ) => {
      const replaced = store.getState().pipeline;
      store.getState().replacePipeline(next, reason);
      // An empty canvas has nothing to bring back, and the new pipeline shows what happened.
      if (replaced.nodes.length === 0) return;
      toast({
        tone: 'success',
        title,
        action: {
          label: 'Undo',
          altText: undoReplacementAltText(apple),
          onClick: () => {
            // Only this replacement: once the pipeline has changed again, or the replacement was
            // undone already, undo would revert something else.
            if (store.getState().pipeline === next) store.getState().undo();
          },
        },
      });
    };

    return {
      loadTemplate: (template) => {
        replace(pipelineFromTemplate(template, createId), 'template', `Loaded “${template.name}”`);
      },
      startBlank: () => {
        if (isBlankPipeline(store.getState().pipeline)) return;
        replace(blankPipeline(createId), 'new', 'Started a blank pipeline');
      },
    };
  }, [store, toast, apple]);
}
