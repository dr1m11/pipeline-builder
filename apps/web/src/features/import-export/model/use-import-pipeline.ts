import { parsePipelineFile } from '@pipeline-builder/core';
import { useCallback } from 'react';

import { usePipelineStoreApi, useReplacementUndo } from '@/entities/pipeline';
import { useToast } from '@/shared/ui/toast';

import { describeImportFailure, describeImportSuccess } from '../lib/import-messages';

/**
 * Returns a function that imports a pipeline file into the surrounding store as one undoable step
 * and says how it went in a toast. A file that cannot be read as a pipeline leaves the pipeline as
 * it was and the toast says why. Replacing a pipeline with nodes offers Undo in the toast, as the
 * replaced draft is kept nowhere else.
 */
export function useImportPipeline(): (file: File) => Promise<void> {
  const store = usePipelineStoreApi();
  const { toast } = useToast();
  const undoAction = useReplacementUndo();

  return useCallback(
    async (file: File) => {
      let text: string;
      try {
        text = await file.text();
      } catch {
        toast({ tone: 'danger', ...describeImportFailure(file.name, { code: 'unreadable' }) });
        return;
      }

      const parsed = parsePipelineFile(text);
      if (!parsed.ok) {
        toast({ tone: 'danger', ...describeImportFailure(file.name, parsed.error) });
        return;
      }

      const replaced = store.getState().pipeline;
      const imported = parsed.value.pipeline;
      store.getState().replacePipeline(imported, 'import');
      toast({
        tone: 'success',
        ...describeImportSuccess(parsed.value),
        action: replaced.nodes.length > 0 ? undoAction(imported, 'undo the import') : undefined,
      });
    },
    [store, toast, undoAction],
  );
}
