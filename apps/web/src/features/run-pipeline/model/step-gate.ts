import type { RunEvent } from '@pipeline-builder/core';

export interface StepGateOptions {
  /** Whether the run starts step by step. */
  readonly stepping: boolean;
  /** Called when the gate pauses before a node, and with null when it is no longer paused. */
  readonly onPausedChange: (nodeId: string | null) => void;
}

/**
 * What lets the nodes of a run start (the engine's `beforeNode`, see docs/adr/0011). Stepping, it
 * lets one node start at a time: it pauses before a node once every node it let through has ended,
 * until `next`. Otherwise it lets every node start at once.
 */
export interface StepGate {
  /** For `RunOptions.beforeNode`: settles when the node `nodeId` may start. */
  readonly beforeNode: (nodeId: string) => Promise<void>;
  /** Takes every event of the run, to know when the nodes it let through have ended. */
  readonly observe: (event: RunEvent) => void;
  /** Lets the node the gate is paused before start, if it is paused. */
  readonly next: () => void;
  /** Starts or stops stepping. Stopped, the gate lets the nodes waiting at it start. */
  readonly setStepping: (stepping: boolean) => void;
}

/** A node waiting at the gate, and what lets it start. */
interface Waiting {
  readonly nodeId: string;
  readonly start: () => void;
}

/**
 * Creates the gate of a run. Nodes wait at it in the order the engine starts them, which is the
 * order they became ready. The gate pauses before the first one only when no node it let through is
 * still working, so a step runs one node from its start to its end however many nodes the engine
 * may run at once, and a run that stops stepping goes on with all of them.
 *
 * Once the run is cancelled (its first `cancelled` node) or has finished, the gate does nothing
 * more. A node still waiting then never starts: the engine does not wait for it (on abort, a
 * pending `beforeNode` may never settle).
 */
export function createStepGate({ stepping: initial, onPausedChange }: StepGateOptions): StepGate {
  let stepping = initial;
  let finished = false;
  const waiting: Waiting[] = [];
  // The nodes the gate let through that have not ended yet.
  const working = new Set<string>();
  let paused: string | null = null;

  const setPaused = (nodeId: string | null): void => {
    if (nodeId === paused) return;
    paused = nodeId;
    onPausedChange(nodeId);
  };

  const letThrough = ({ nodeId, start }: Waiting): void => {
    working.add(nodeId);
    start();
  };

  /** Lets nodes through, or pauses before the first one waiting, as stepping and work allow. */
  const update = (): void => {
    if (finished) return;
    if (!stepping) {
      for (const each of waiting.splice(0)) letThrough(each);
      setPaused(null);
      return;
    }
    setPaused(working.size === 0 ? (waiting[0]?.nodeId ?? null) : null);
  };

  return {
    beforeNode: (nodeId) =>
      new Promise<void>((resolve) => {
        waiting.push({ nodeId, start: resolve });
        update();
      }),

    observe: (event) => {
      // Nodes are cancelled only when the run is: it is ending, and must not pause on the way.
      if (
        event.type === 'run-finished' ||
        (event.type === 'node-status' && event.status === 'cancelled')
      ) {
        finished = true;
        waiting.length = 0;
        working.clear();
        paused = null;
        return;
      }
      // A node that started ends done or failed (or cancelled); it is never skipped.
      if (
        event.type === 'node-status' &&
        (event.status === 'done' || event.status === 'error') &&
        working.delete(event.nodeId)
      ) {
        update();
      }
    },

    next: () => {
      if (finished || paused === null) return;
      const first = waiting.shift();
      if (first !== undefined) letThrough(first);
      update();
    },

    setStepping: (value) => {
      if (finished || stepping === value) return;
      stepping = value;
      update();
    },
  };
}
