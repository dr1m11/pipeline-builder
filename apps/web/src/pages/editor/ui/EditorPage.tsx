import { ReactFlowProvider } from '@xyflow/react';
import { CodeXml } from 'lucide-react';

import { PipelineStoreProvider, usePipelineStore } from '@/entities/pipeline';
import { NodePalette, useNodeDrop } from '@/features/add-node';
import { useEditSelection } from '@/features/edit-selection';
import { ExportButton, ImportButton } from '@/features/import-export';
import { NewPipelineMenu, TemplateButtons } from '@/features/load-template';
import { ThemeToggle } from '@/features/toggle-theme';
import { UndoRedoButtons, useUndoRedoShortcuts } from '@/features/undo-redo';
import { REPOSITORY_URL } from '@/shared/config';
import { IconButton } from '@/shared/ui/icon-button';
import { Inspector } from '@/widgets/inspector';
import { PipelineCanvas } from '@/widgets/pipeline-canvas';

import { useAutosavedStore } from '../model/use-autosaved-store';

export function EditorPage() {
  const store = useAutosavedStore();

  return (
    <PipelineStoreProvider store={store}>
      {/* Wraps the page, not just the canvas: the palette adds nodes where the canvas is looking. */}
      <ReactFlowProvider>
        <EditorShortcuts />
        <div className="grid h-full grid-rows-[auto_1fr]">
          <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2">
            <PipelineName />
            <div className="flex items-center gap-2">
              <div role="toolbar" aria-label="File" className="flex items-center gap-1">
                <NewPipelineMenu />
                <ImportButton />
                <ExportButton />
              </div>
              <span aria-hidden className="h-5 w-px bg-border" />
              <div role="toolbar" aria-label="Edit" className="flex items-center gap-1">
                <UndoRedoButtons />
              </div>
              <span aria-hidden className="h-5 w-px bg-border" />
              <ThemeToggle />
              <IconButton label="Source code on GitHub" asChild>
                <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
                  <CodeXml aria-hidden />
                </a>
              </IconButton>
            </div>
          </header>
          <div className="grid min-h-0 grid-cols-[16rem_1fr_20rem]">
            <aside
              aria-label="Node palette"
              className="overflow-y-auto border-r border-border bg-surface"
            >
              <NodePalette />
            </aside>
            <CanvasArea />
            <aside
              aria-label="Inspector"
              className="overflow-y-auto border-l border-border bg-surface"
            >
              <Inspector />
            </aside>
          </div>
        </div>
      </ReactFlowProvider>
    </PipelineStoreProvider>
  );
}

/** The editor's keyboard shortcuts, which need the page's store. */
function EditorShortcuts() {
  useUndoRedoShortcuts();
  useEditSelection();
  return null;
}

function PipelineName() {
  const name = usePipelineStore((state) => state.pipeline.name);
  return <h1 className="text-base font-semibold">{name}</h1>;
}

/** The canvas, which also takes node kinds dropped from the palette. */
function CanvasArea() {
  const dropHandlers = useNodeDrop();
  return (
    <main className="relative min-h-0" aria-label="Pipeline canvas" {...dropHandlers}>
      <PipelineCanvas />
      <EmptyCanvasHint />
    </main>
  );
}

function EmptyCanvasHint() {
  const isEmpty = usePipelineStore((state) => state.pipeline.nodes.length === 0);
  if (!isEmpty) return null;
  return (
    // Lets pointer events through to the canvas, so a node can be dropped on the hint too; only
    // the template buttons take them.
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 mx-auto flex w-fit max-w-[calc(100%-2rem)] -translate-y-1/2 flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-4 py-3 text-center text-sm text-fg-muted">
      <p>Drag a node from the palette, or click one, to start your pipeline.</p>
      <TemplateButtons className="[&_button]:pointer-events-auto" />
    </div>
  );
}
