import type { LlmProvider } from '@pipeline-builder/core';
import { ReactFlowProvider } from '@xyflow/react';
import { CodeXml } from 'lucide-react';
import { useState } from 'react';

import { PipelineStoreProvider, usePipelineStore } from '@/entities/pipeline';
import { createRunStore, RunStoreProvider } from '@/entities/run';
import { NodePalette, useNodeDrop } from '@/features/add-node';
import { useEditSelection } from '@/features/edit-selection';
import { ExportButton, ImportButton } from '@/features/import-export';
import { NewPipelineMenu, TemplateButtons } from '@/features/load-template';
import { ApiKeysButton, ApiKeysDialog } from '@/features/manage-api-keys';
import { RunControls } from '@/features/run-pipeline';
import { ShortcutsHelp, useShowShortcutsShortcut } from '@/features/show-shortcuts';
import { ThemeToggle } from '@/features/toggle-theme';
import { UndoRedoButtons, useUndoRedoShortcuts } from '@/features/undo-redo';
import { REPOSITORY_URL } from '@/shared/config';
import { IconButton } from '@/shared/ui/icon-button';
import { Inspector } from '@/widgets/inspector';
import { PipelineCanvas } from '@/widgets/pipeline-canvas';

import { EDITOR_SHORTCUTS } from '../config/shortcuts';
import { useAutosavedStore } from '../model/use-autosaved-store';

/** Whether the API keys dialog is open, and the provider whose field it focuses. */
interface ApiKeysDialogState {
  readonly open: boolean;
  readonly provider?: LlmProvider;
}

export function EditorPage() {
  const store = useAutosavedStore();
  // The run of the pipeline: view state beside the document, never saved (see entities/run).
  const [runStore] = useState(createRunStore);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  // Owned here, not by the header button: a run that needs a key opens the dialog at its provider.
  const [apiKeysDialog, setApiKeysDialog] = useState<ApiKeysDialogState>({ open: false });

  const askForApiKey = (provider: LlmProvider) => {
    setApiKeysDialog({ open: true, provider });
  };

  return (
    <PipelineStoreProvider store={store}>
      <RunStoreProvider store={runStore}>
        {/* Wraps the page, not just the canvas: the palette adds nodes where the canvas is looking. */}
        <ReactFlowProvider>
          <EditorShortcuts
            onShowShortcuts={() => {
              setShortcutsHelpOpen(true);
            }}
          />
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
                <div role="toolbar" aria-label="Run" className="flex items-center gap-1">
                  <RunControls onMissingApiKey={askForApiKey} />
                </div>
                <span aria-hidden className="h-5 w-px bg-border" />
                <ApiKeysButton
                  onClick={() => {
                    setApiKeysDialog({ open: true });
                  }}
                />
                <ApiKeysDialog
                  open={apiKeysDialog.open}
                  provider={apiKeysDialog.provider}
                  onOpenChange={(open) => {
                    setApiKeysDialog((current) => ({ ...current, open }));
                  }}
                />
                <ShortcutsHelp
                  shortcuts={EDITOR_SHORTCUTS}
                  open={shortcutsHelpOpen}
                  onOpenChange={setShortcutsHelpOpen}
                />
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
      </RunStoreProvider>
    </PipelineStoreProvider>
  );
}

/** The editor's keyboard shortcuts, under the page's store; `?` shows them all. */
function EditorShortcuts({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  useUndoRedoShortcuts();
  useEditSelection();
  useShowShortcutsShortcut(onShowShortcuts);
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
