import { type LlmClient, type LlmProvider, validatePipeline } from '@pipeline-builder/core';
import { FastForward, Footprints, LoaderCircle, Play, Square, StepForward } from 'lucide-react';
import { Fragment, useId, useRef, useState } from 'react';

import { usePipelineStore } from '@/entities/pipeline';
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

import { NEXT_STEP_SHORTCUT, RUN_SHORTCUT, STOP_SHORTCUT } from '../config/shortcuts';
import { runBlocker, stepBlockers } from '../lib/run-readiness';
import { type PipelineRunner, usePipelineRunner } from '../model/use-pipeline-runner';
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
 * in progress. A polite live region announces when a run starts, pauses, goes on without pausing
 * and ends, never single tokens.
 *
 * The Step mode toggle makes runs pause before each node. While it is on, Next step (F10) lets
 * the node the run is paused before run, and Continue lets the run go on without pausing.
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
  // A run paused before a node waits for the user: nothing spins.
  const working = useRunStore((state) => state.status === 'running' && state.pausedNodeId === null);
  const nodeCount = usePipelineStore((state) => state.pipeline.nodes.length);
  // The count alone, so that an edit re-renders Run only when the count changes. Core caches the
  // report per pipeline, so the canvas and the inspector share it (see docs/adr/0008).
  const errorCount = usePipelineStore((state) => validatePipeline(state.pipeline).errorCount);
  const blocker = running ? 'The pipeline is running' : runBlocker(nodeCount, { errorCount });

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
          {working ? (
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
      <StepControls runner={runner} apple={apple} />
      {/* A new message replaces the node, so the same message twice is announced twice. */}
      <p role="status" className="sr-only">
        <span key={runner.announcement.id}>{runner.announcement.message}</span>
      </p>
    </>
  );
}

interface StepControlsProps {
  runner: PipelineRunner;
  apple: boolean;
}

/**
 * The Step mode toggle and, while it is on, Next step and Continue. Unavailable controls stay
 * focusable and say why, like Run.
 */
function StepControls({ runner, apple }: StepControlsProps) {
  const nextReasonId = useId();
  const continueReasonId = useId();
  const status = useRunStore((state) => state.status);
  const stepping = useRunStore((state) => state.stepping);
  const pausedNodeId = useRunStore((state) => state.pausedNodeId);
  const blockers = stepBlockers({ status, stepping, pausedNodeId });

  return (
    <>
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      <Tooltip side="bottom" content="Pause before each node">
        <Button
          variant="secondary"
          aria-pressed={runner.stepMode}
          onClick={() => {
            runner.setStepMode(!runner.stepMode);
          }}
          className="aria-pressed:border-accent aria-pressed:bg-accent/15"
        >
          <Footprints aria-hidden />
          Step mode
        </Button>
      </Tooltip>
      {runner.stepMode && (
        <>
          <Tooltip
            side="bottom"
            content={
              blockers.next ?? (
                <ShortcutHint
                  label="Run the next node"
                  shortcut={NEXT_STEP_SHORTCUT}
                  apple={apple}
                />
              )
            }
          >
            <Button
              variant="secondary"
              aria-disabled={blockers.next === null ? undefined : true}
              {...(blockers.next === null ? {} : { 'aria-describedby': nextReasonId })}
              onClick={() => {
                runner.nextStep();
              }}
              className={`${UNAVAILABLE} aria-disabled:hover:bg-surface`}
            >
              <StepForward aria-hidden />
              Next step
            </Button>
          </Tooltip>
          <span id={nextReasonId} hidden>
            {blockers.next}
          </span>
          <Tooltip side="bottom" content={blockers.continue ?? 'Run the rest without pausing'}>
            <Button
              variant="secondary"
              aria-disabled={blockers.continue === null ? undefined : true}
              {...(blockers.continue === null ? {} : { 'aria-describedby': continueReasonId })}
              onClick={() => {
                runner.continueRun();
              }}
              className={`${UNAVAILABLE} aria-disabled:hover:bg-surface`}
            >
              <FastForward aria-hidden />
              Continue
            </Button>
          </Tooltip>
          <span id={continueReasonId} hidden>
            {blockers.continue}
          </span>
        </>
      )}
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
