import type { Pipeline, PipelineTemplate, ReplacePipelineCommand } from '@pipeline-builder/core';
import { useMemo } from 'react';

import {
  createBlankPipeline,
  isBlankPipeline,
  usePipelineStoreApi,
  useReplacementUndo,
} from '@/entities/pipeline';
import { useToast } from '@/shared/ui/toast';

import { pipelineFromTemplate } from '../lib/new-pipeline';

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
 * new one into view. Replacing a pipeline with nodes says so in a toast with Undo, as the replaced
 * draft is kept nowhere else.
 */
export function useNewPipeline(): NewPipelineActions {
  const store = usePipelineStoreApi();
  const { toast } = useToast();
  const undoAction = useReplacementUndo();

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
        action: undoAction(next, 'bring back the previous pipeline'),
      });
    };

    return {
      loadTemplate: (template) => {
        replace(pipelineFromTemplate(template, createId), 'template', `Loaded “${template.name}”`);
      },
      startBlank: () => {
        if (isBlankPipeline(store.getState().pipeline)) return;
        replace(createBlankPipeline(createId()), 'new', 'Started a blank pipeline');
      },
    };
  }, [store, toast, undoAction]);
}
