import { createEmptyPipeline } from '@pipeline-builder/core';
import { ReactFlowProvider } from '@xyflow/react';
import { CodeXml } from 'lucide-react';
import { useState } from 'react';

import { createPipelineStore, PipelineStoreProvider, usePipelineStore } from '@/entities/pipeline';
import { ThemeToggle } from '@/features/toggle-theme';
import { REPOSITORY_URL } from '@/shared/config';
import { IconButton } from '@/shared/ui/icon-button';
import { PipelineCanvas } from '@/widgets/pipeline-canvas';

export function EditorPage() {
  const [store] = useState(() =>
    createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Untitled pipeline' })),
  );

  return (
    <PipelineStoreProvider store={store}>
      {/* Wraps the page, not just the canvas: the node palette (#25) needs the viewport too. */}
      <ReactFlowProvider>
        <div className="grid h-full grid-rows-[auto_1fr]">
          <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2">
            <PipelineName />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <IconButton label="Source code on GitHub" asChild>
                <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
                  <CodeXml aria-hidden />
                </a>
              </IconButton>
            </div>
          </header>
          <main className="min-h-0" aria-label="Pipeline canvas">
            <PipelineCanvas />
          </main>
        </div>
      </ReactFlowProvider>
    </PipelineStoreProvider>
  );
}

function PipelineName() {
  const name = usePipelineStore((state) => state.pipeline.name);
  return <h1 className="text-base font-semibold">{name}</h1>;
}
