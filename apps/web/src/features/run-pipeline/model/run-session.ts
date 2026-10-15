import {
  type LlmClient,
  type NodeRunError,
  type Pipeline,
  type RunEvent,
  runPipeline,
  type RunSummary,
} from '@pipeline-builder/core';

import type { RunStore } from '@/entities/run';

import { createStepGate } from './step-gate';

/** The node that failed first in a run, and why. */
export interface NodeFailure {
  readonly nodeId: string;
  readonly error: NodeRunError;
}

/** How a run session ended. */
export type RunEnd =
  /** The engine finished the run; `firstFailure` is the node that failed first, if one did. */
  | {
      readonly type: 'finished';
      readonly summary: RunSummary;
      readonly firstFailure: NodeFailure | null;
    }
  /** The engine refused the pipeline, which has validation errors. Nothing ran. */
  | { readonly type: 'invalid' }
  /** `runPipeline` rejected, which is a bug; the run was aborted and its nodes left cancelled. */
  | { readonly type: 'broken' };

export interface RunSessionOptions {
  /** The pipeline to run: a snapshot, so edits made during the run do not change it. */
  readonly pipeline: Pipeline;
  readonly llm: LlmClient;
  /** Where the run is shown. The session starts it and feeds it the engine's events. */
  readonly store: RunStore;
  /** Whether the run goes step by step, pausing before each node until `next`; not by default. */
  readonly stepping?: boolean;
  /** Called when the run pauses before the node `nodeId`, once the store shows the pause. */
  readonly onPause?: (nodeId: string) => void;
}

/** A run in progress, from start to end. */
export interface RunSession {
  /** Settles once the run has ended, and never rejects. */
  readonly ended: Promise<RunEnd>;
  /** Cancels the run: the engine reports every node that has not ended as `cancelled`. */
  stop: () => void;
  /**
   * Lets the node the run is paused before start. While the run goes step by step, it pauses again
   * before the next node once this one has ended.
   */
  next: () => void;
  /**
   * Makes the run go step by step from now on, or not. A run that stops stepping goes on at once,
   * without pausing; one that starts pauses before the next node to start.
   */
  setStepping: (stepping: boolean) => void;
  /**
   * Cancels the run and drops whatever it would still report, leaving the store to the caller:
   * for a run whose document was replaced, or whose editor is gone.
   */
  discard: () => void;
  /** Whether `discard` was called. */
  readonly discarded: boolean;
}

/**
 * Starts a run of `pipeline` in `store`, cancellable through an `AbortController` of its own.
 *
 * The engine reports an event for every token, so events are buffered and applied to the store at
 * most once per animation frame, in order; `run-finished` and a pause apply them at once. A run
 * that breaks off (`runPipeline` rejects, a bug) is aborted, so requests still in flight stop, and
 * is finished in the store as `error`.
 *
 * Step by step, a gate lets one node start at a time (see `createStepGate`). The engine keeps its
 * default concurrency rather than one node at a time, so a run that stops stepping (Continue) runs
 * its independent branches at once again.
 */
export function startRunSession({
  pipeline,
  llm,
  store,
  stepping = false,
  onPause,
}: RunSessionOptions): RunSession {
  const controller = new AbortController();
  let pending: RunEvent[] = [];
  let frame: number | null = null;
  let discarded = false;
  let firstFailure: NodeFailure | null = null;

  const flush = (): void => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    const events = pending;
    pending = [];
    if (!discarded && events.length > 0) store.getState().applyEvents(events);
  };

  const gate = createStepGate({
    stepping,
    onPausedChange: (nodeId) => {
      if (discarded || controller.signal.aborted) return;
      // The store shows all the run did before the pause: the node before it has ended there too.
      flush();
      store.getState().setPausedNode(nodeId);
      if (nodeId !== null) onPause?.(nodeId);
    },
  });

  const onEvent = (event: RunEvent): void => {
    if (discarded) return;
    if (
      firstFailure === null &&
      event.type === 'node-status' &&
      event.status === 'error' &&
      event.error !== undefined
    ) {
      firstFailure = { nodeId: event.nodeId, error: event.error };
    }
    pending.push(event);
    gate.observe(event);
    if (event.type === 'run-finished') flush();
    else if (pending.length > 0) frame ??= requestAnimationFrame(flush);
  };

  store.getState().start({ stepping });
  const ended = runPipeline(pipeline, {
    llm,
    signal: controller.signal,
    onEvent,
    beforeNode: gate.beforeNode,
  }).then(
    (result): RunEnd => {
      if (result.ok) return { type: 'finished', summary: result.value, firstFailure };
      if (!discarded) store.getState().reset();
      return { type: 'invalid' };
    },
    (error: unknown): RunEnd => {
      // The run reports nothing more, but requests it started may still be streaming.
      controller.abort();
      pending.push({ type: 'run-finished', status: 'error' });
      flush();
      console.error('The pipeline run failed unexpectedly', error);
      return { type: 'broken' };
    },
  );

  return {
    ended,
    stop: () => {
      controller.abort();
    },
    next: () => {
      if (!discarded) gate.next();
    },
    setStepping: (value) => {
      if (discarded) return;
      store.getState().setStepping(value);
      gate.setStepping(value);
    },
    discard: () => {
      discarded = true;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pending = [];
      controller.abort();
    },
    get discarded() {
      return discarded;
    },
  };
}
