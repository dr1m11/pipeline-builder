import { serializePipeline } from '@pipeline-builder/core';
import { Download } from 'lucide-react';

import { usePipelineStoreApi } from '@/entities/pipeline';
import { IconButton } from '@/shared/ui/icon-button';

import { downloadFile } from '../api/download-file';
import { pipelineFileName } from '../lib/pipeline-file-name';

/** Downloads the surrounding pipeline as a pipeline file, `<pipeline name>.pipeline.json`. */
export function ExportButton() {
  const store = usePipelineStoreApi();
  return (
    <IconButton
      label="Export pipeline"
      onClick={() => {
        const { pipeline } = store.getState();
        downloadFile({
          name: pipelineFileName(pipeline.name),
          text: serializePipeline(pipeline),
          type: 'application/json',
        });
      }}
    >
      <Download aria-hidden />
    </IconButton>
  );
}
