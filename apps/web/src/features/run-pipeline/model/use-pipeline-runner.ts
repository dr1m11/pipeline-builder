import {
  findNode,
  type LlmClient,
  type LlmProvider,
  validatePipeline,
} from '@pipeline-builder/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getApiKey } from '@/entities/api-key';
import { usePipelineStoreApi } from '@/entities/pipeline';
import { useRunStoreApi } from '@/entities/run';
import { createProxyLlmClient } from '@/shared/api';
import { useToast } from '@/shared/ui/toast';

import { describeRunEnd, runFailureToast } from '../lib/run-messages';
import { findMissingApiKey, runBlocker } from '../lib/run-readiness';
import { type RunSession, startRunSession } from './run-session';

export interface PipelineRunnerOptions {
  /** Streams the answers of LLM Call nodes; the proxy client with the user's API keys by default. */
  readonly llm?: LlmClient | undefined;
  /**
   * Asks the user for the API key of `provider`, which a run needs and does not have, or which the
   * provider rejected (from the failed run's toast).
   */
  readonly onMissingApiKey: (provider: LlmProvider) => void;
}

/** A message for the run's live region. `id` changes with every message, even a repeated one. */
export interface RunAnnouncement {
  readonly id: number;
  readonly message: string;
}

/** Runs the pipeline of the surrounding stores. */
export interface PipelineRunner {
  /**
   * Runs the pipeline as it is now, unless a run is in progress. A pipeline that cannot run (see
   * `runBlocker`) is not run and the announcement says why; one that needs an API key the user has
   * not added asks for it with `onMissingApiKey` instead.
   */
  readonly run: () => void;
  /** Stops the run in progress, if any, also while it is paused. */
  readonly stop: () => void;
  /**
   * Whether runs go step by step: a run started in step mode pauses before each node, until
   * `nextStep` lets that node run. Off at first.
   */
  readonly stepMode: boolean;
  /**
   * Turns step mode on or off, also for the run in progress: on, it pauses before the next node to
   * start; off, it goes on at once without pausing.
   */
  readonly setStepMode: (stepMode: boolean) => void;
  /** Lets the node the run is paused before run; the run pauses again before the next one. */
  readonly nextStep: () => void;
  /**
   * Lets the run in progress go on to its end without pausing, and says so; step mode stays on for
   * the next run. Does nothing when no run is going step by step.
   */
  readonly continueRun: () => void;
  /**
   * The latest message for screen readers: a run started, paused before a node or ended, or why it
   * could not start.
   */
  readonly announcement: RunAnnouncement;
}

/**
 * Runs the pipeline of the surrounding pipeline store and shows the run in the surrounding run
 * store. A run works on a snapshot of the pipeline, so the user may go on editing while it runs.
 * In step mode it pauses before each node; the run store shows where (`pausedNodeId`), and the
 * announcement says "Paused before Model" instead of "Run started", then "Running without pausing"
 * on Continue.
 *
 * A run is cancelled when the document is replaced (an import, a template, a new pipeline, or an
 * undo or a redo of one), and the run store is cleared, since its nodes are gone; the same happens,
 * silently, when the component unmounts. A run that fails shows a toast with the node that failed
 * first. Needs `ToastProvider` above it.
 */
export function usePipelineRunner({ llm, onMissingApiKey }: PipelineRunnerOptions): PipelineRunner {
  const pipelineStore = usePipelineStoreApi();
  const runStore = useRunStoreApi();
  const { toast } = useToast();
  const sessionRef = useRef<RunSession | null>(null);
  const [announcement, setAnnouncement] = useState<RunAnnouncement>({ id: 0, message: '' });
  const [stepMode, setStepMode] = useState(false);

  const announce = useCallback((message: string) => {
    setAnnouncement((previous) => ({ id: previous.id + 1, message }));
  }, []);

  useEffect(() => {
    /** Drops the run and what it showed; returns whether it was still in progress. */
    const discard = (): boolean => {
      const wasRunning = runStore.getState().status === 'running';
      sessionRef.current?.discard();
      sessionRef.current = null;
      runStore.getState().reset();
      return wasRunning;
    };
    const unsubscribe = pipelineStore.subscribe((state, previous) => {
      if (state.documentKey !== previous.documentKey && discard()) announce('Run stopped');
    });
    return () => {
      unsubscribe();
      discard();
    };
  }, [pipelineStore, runStore, announce]);

  const run = () => {
    if (runStore.getState().status === 'running') return;
    const { pipeline } = pipelineStore.getState();
    const blocker = runBlocker(pipeline.nodes.length, validatePipeline(pipeline));
    if (blocker !== null) {
      announce(blocker);
      return;
    }
    const missingKey = findMissingApiKey(pipeline, getApiKey);
    if (missingKey !== null) {
      onMissingApiKey(missingKey);
      return;
    }

    const session = startRunSession({
      pipeline,
      llm: llm ?? createProxyLlmClient({ getApiKey }),
      store: runStore,
      stepping: stepMode,
      onPause: (nodeId) => {
        announce(`Paused before ${findNode(pipeline, nodeId)?.label ?? 'the next node'}`);
      },
    });
    sessionRef.current = session;
    // A run in step mode pauses before its first node at once, which says that it started.
    if (!stepMode) announce('Run started');
    void session.ended.then((end) => {
      if (session.discarded) return;
      announce(describeRunEnd(end));
      const failure = runFailureToast(end, pipeline, onMissingApiKey);
      if (failure !== null) toast(failure);
    });
  };

  const stop = () => {
    sessionRef.current?.stop();
  };

  const changeStepMode = (value: boolean) => {
    setStepMode(value);
    sessionRef.current?.setStepping(value);
  };

  const nextStep = () => {
    sessionRef.current?.next();
  };

  const continueRun = () => {
    const { status, stepping } = runStore.getState();
    if (status !== 'running' || !stepping) return;
    sessionRef.current?.setStepping(false);
    announce('Running without pausing');
  };

  return {
    run,
    stop,
    stepMode,
    setStepMode: changeStepMode,
    nextStep,
    continueRun,
    announcement,
  };
}
