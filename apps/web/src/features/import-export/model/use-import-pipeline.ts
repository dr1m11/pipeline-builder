import { parsePipelineFile } from '@pipeline-builder/core';
import { useCallback } from 'react';

import { usePipelineStoreApi } from '@/entities/pipeline';
import { useToast } from '@/shared/ui/toast';

import { describeImportFailure, describeImportSuccess } from '../lib/import-messages';

/**
 * Returns a function that imports a pipeline file into the surrounding store as one undoable step
 * and says how it went in a toast. A file that cannot be read as a pipeline leaves the pipeline as
 * it was and the toast says why. Replacing a pipeline with nodes offers Undo in the toast, because
 * the history lives in memory only and nothing else keeps the replaced draft (see docs/adr/0009).
 */
export function useImportPipeline(): (file: File) => Promise<void> {
  const store = usePipelineStoreApi();
  const { toast } = useToast();

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
      const undo = {
        label: 'Undo',
        altText: 'Undo the import',
        onClick: () => {
          // Only the import: once the pipeline has changed again, or the import was undone
          // already, undo would revert something else.
          if (store.getState().pipeline === imported) store.getState().undo();
        },
      };
      toast({
        tone: 'success',
        ...describeImportSuccess(parsed.value),
        action: replaced.nodes.length > 0 ? undo : undefined,
      });
    },
    [store, toast],
  );
}
