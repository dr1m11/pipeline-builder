import { createEmptyPipeline } from '@pipeline-builder/core';
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react';
import { CodeXml } from 'lucide-react';

import { ThemeToggle } from '@/features/toggle-theme';
import { REPOSITORY_URL } from '@/shared/config';
import { IconButton } from '@/shared/ui/icon-button';

const initialPipeline = createEmptyPipeline({ id: 'draft', name: 'Untitled pipeline' });

export function EditorPage() {
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2">
        <h1 className="text-base font-semibold">{initialPipeline.name}</h1>
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
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background />
          <Controls />
          <MiniMap ariaLabel="Pipeline overview" />
        </ReactFlow>
      </main>
    </div>
  );
}
