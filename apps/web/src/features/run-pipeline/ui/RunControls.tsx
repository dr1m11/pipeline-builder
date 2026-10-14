import type { LlmClient, LlmProvider } from '@pipeline-builder/core';
import { LoaderCircle, Play, Square } from 'lucide-react';
import { Fragment, useId, useRef, useState } from 'react';

import { usePipelineStore, useValidationReport } from '@/entities/pipeline';
import { useRunStore } from '@/entities/run';
import {
  formatShortcut,
  isApplePlatform,
  type ShortcutDescriptor,
  shortcutKeys,
} from '@/shared/lib/keyboard';
import { Button } from '@/shared/ui/button';
import { Kbd } from '@/shared/ui/kbd';
import { Tooltip } from '@/shared/ui/tooltip';

import { RUN_SHORTCUT, STOP_SHORTCUT } from '../config/shortcuts';
import { runBlocker } from '../lib/run-readiness';
import { usePipelineRunner } from '../model/use-pipeline-runner';
import { useRunShortcuts } from '../model/use-run-shortcuts';

export interface RunControlsProps {
  /**
   * Asks the user for the API key of `provider` (the page opens the API keys dialog at its field):
   * a run needs it and the user has not added it, or the provider rejected it. Run takes focus
   * first, so the dialog gives focus back to Run when it closes.
   */
  onMissingApiKey: (provider: LlmProvider) => void;
  /** Streams the answers of LLM Call nodes; the proxy client with the user's API keys by default. */
  llm?: LlmClient | undefined;
}

// Unavailable buttons stay focusable (`aria-disabled` rather than `disabled`): focus stays on Run
// as a run starts and on Stop as it ends, and the tooltip can tell why Run is unavailable.
const UNAVAILABLE = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

/**
 * Run and Stop for the surrounding pipeline, with Ctrl/⌘+Enter and Ctrl/⌘+. (see `RUN_SHORTCUTS`).
 * Run is unavailable while the pipeline has validation errors or no nodes, and says why ("Fix 2
 * errors to run") in its tooltip and its accessible description; Stop is available while a run is
 * in progress. A polite live region announces when a run starts and ends, never single tokens.
 *
 * Mount it once per editor, under the pipeline and run stores and `ToastProvider`: it owns the
 * editor's run, which stops when it unmounts or when the document is replaced.
 */
export function RunControls({ onMissingApiKey, llm }: RunControlsProps) {
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const runner = usePipelineRunner({
    llm,
    onMissingApiKey: (provider) => {
      // The dialog gives focus back to whatever had it when it opened, so Run takes it first:
      // Safari, and Firefox on macOS, leave a clicked button unfocused, and a toast's "Add API key"
      // button goes away with its toast.
      runButtonRef.current?.focus();
      onMissingApiKey(provider);
    },
  });
  useRunShortcuts(runner);
  const [apple] = useState(() => isApplePlatform());
  const reasonId = useId();
  const running = useRunStore((state) => state.status === 'running');
  const nodeCount = usePipelineStore((state) => state.pipeline.nodes.length);
  const report = useValidationReport();
  const blocker = running ? 'The pipeline is running' : runBlocker(nodeCount, report);

  return (
    <>
      <Tooltip
        side="bottom"
        content={
          blocker ?? <ShortcutHint label="Run the pipeline" shortcut={RUN_SHORTCUT} apple={apple} />
        }
      >
        <Button
          ref={runButtonRef}
          variant="primary"
          aria-disabled={blocker === null ? undefined : true}
          // Only when there is a reason: an `aria-describedby` set to undefined would also take
          // the tooltip's description off the button.
          {...(blocker === null ? {} : { 'aria-describedby': reasonId })}
          onClick={() => {
            runner.run();
          }}
          className={`${UNAVAILABLE} aria-disabled:hover:bg-accent`}
        >
          {running ? (
            <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <Play aria-hidden />
          )}
          Run
        </Button>
      </Tooltip>
      <span id={reasonId} hidden>
        {blocker}
      </span>
      <Tooltip
        side="bottom"
        content={<ShortcutHint label="Stop the run" shortcut={STOP_SHORTCUT} apple={apple} />}
      >
        <Button
          variant="secondary"
          aria-disabled={running ? undefined : true}
          onClick={() => {
            runner.stop();
          }}
          className={`${UNAVAILABLE} aria-disabled:hover:bg-surface`}
        >
          <Square aria-hidden />
          Stop
        </Button>
      </Tooltip>
      {/* A new message replaces the node, so the same message twice is announced twice. */}
      <p role="status" className="sr-only">
        <span key={runner.announcement.id}>{runner.announcement.message}</span>
      </p>
    </>
  );
}

interface ShortcutHintProps {
  label: string;
  shortcut: ShortcutDescriptor;
  apple: boolean;
}

/** A tooltip's text followed by the keys of the main shortcut on this platform. */
function ShortcutHint({ label, shortcut, apple }: ShortcutHintProps) {
  const [main] = shortcutKeys(shortcut, apple);
  const keys = main === undefined ? [] : formatShortcut(main, apple);
  // The spaces only separate the words of the tooltip's text: flex layout drops them.
  return (
    <span className="flex items-center gap-2">
      {label}{' '}
      <span className="flex gap-0.5">
        {keys.map((key, index) => (
          <Fragment key={key}>
            {index > 0 && ' '}
            <Kbd>{key}</Kbd>
          </Fragment>
        ))}
      </span>
    </span>
  );
}
