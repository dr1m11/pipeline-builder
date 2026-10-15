import type { NodeRunStatus, RunEvent } from '@pipeline-builder/core';
import { describe, expect, it, vi } from 'vitest';

import { createStepGate } from './step-gate';

function status(nodeId: string, nodeStatus: NodeRunStatus): RunEvent {
  return { type: 'node-status', nodeId, status: nodeStatus };
}

/** Lets the promises that settled run their callbacks. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setUp(stepping: boolean) {
  const onPausedChange = vi.fn<(nodeId: string | null) => void>();
  const gate = createStepGate({ stepping, onPausedChange });
  const started: string[] = [];
  /** Asks the gate to start `nodeId`, as the engine does, and records when it may. */
  const ask = (nodeId: string) => {
    void gate.beforeNode(nodeId).then(() => {
      started.push(nodeId);
    });
  };
  /** Reports that `nodeId` ran and ended with `ending`. */
  const end = (nodeId: string, ending: NodeRunStatus = 'done') => {
    gate.observe(status(nodeId, 'running'));
    gate.observe(status(nodeId, ending));
  };
  const pauses = () => onPausedChange.mock.calls.map(([nodeId]) => nodeId);
  return { gate, ask, end, started, pauses };
}

describe('createStepGate', () => {
  it('lets every node start at once when not stepping', async () => {
    const { ask, started, pauses } = setUp(false);

    ask('a');
    ask('b');
    await settle();

    expect(started).toEqual(['a', 'b']);
    expect(pauses()).toEqual([]);
  });

  it('pauses before each node, and lets one start per step', async () => {
    const { gate, ask, end, started, pauses } = setUp(true);

    ask('a');
    await settle();
    expect(started).toEqual([]);
    expect(pauses()).toEqual(['a']);

    gate.next();
    await settle();
    expect(started).toEqual(['a']);
    expect(pauses()).toEqual(['a', null]);

    end('a');
    ask('b');
    await settle();
    expect(started).toEqual(['a']);
    expect(pauses()).toEqual(['a', null, 'b']);

    gate.next();
    await settle();
    expect(started).toEqual(['a', 'b']);
  });

  it('pauses before the next waiting node only once the node it let through has ended', async () => {
    const { gate, ask, end, started, pauses } = setUp(true);
    // Two independent branches: the engine starts both, and they wait in the order they came.
    ask('left');
    ask('right');
    await settle();
    expect(pauses()).toEqual(['left']);

    gate.next();
    await settle();
    expect(started).toEqual(['left']);
    expect(pauses()).toEqual(['left', null]);
    // Still running: Next does nothing.
    gate.next();
    await settle();
    expect(started).toEqual(['left']);

    end('left', 'error');
    expect(pauses()).toEqual(['left', null, 'right']);
    gate.next();
    await settle();
    expect(started).toEqual(['left', 'right']);
  });

  it('lets every waiting node start when stepping stops, and pauses no more', async () => {
    const { gate, ask, started, pauses } = setUp(true);
    ask('left');
    ask('right');
    await settle();

    gate.setStepping(false);
    ask('later');
    await settle();

    expect(started).toEqual(['left', 'right', 'later']);
    expect(pauses()).toEqual(['left', null]);
  });

  it('starts pausing when stepping starts, once the nodes it let through have ended', async () => {
    const { gate, ask, end, started, pauses } = setUp(false);
    ask('a');
    await settle();

    gate.setStepping(true);
    ask('b');
    await settle();
    expect(started).toEqual(['a']);
    expect(pauses()).toEqual([]);

    end('a');
    expect(pauses()).toEqual(['b']);
    gate.next();
    await settle();
    expect(started).toEqual(['a', 'b']);
  });

  it('ignores a change of stepping to what it already is', async () => {
    const { gate, ask, pauses } = setUp(true);
    ask('a');
    await settle();

    gate.setStepping(true);

    expect(pauses()).toEqual(['a']);
  });

  it('does nothing more once the run is cancelled', async () => {
    const { gate, ask, started, pauses } = setUp(true);
    ask('left');
    ask('right');
    await settle();
    gate.next();
    await settle();

    // Stopped while `left` runs: its cancellation must not pause before `right`.
    gate.observe(status('left', 'cancelled'));
    gate.observe(status('right', 'cancelled'));
    gate.next();
    gate.setStepping(false);
    await settle();

    expect(started).toEqual(['left']);
    expect(pauses()).toEqual(['left', null]);
  });

  it('does nothing more once the run has finished', async () => {
    const { gate, ask, end, started, pauses } = setUp(true);
    ask('a');
    await settle();
    gate.next();
    await settle();
    end('a');

    gate.observe({ type: 'run-finished', status: 'done' });
    gate.setStepping(false);
    gate.next();
    await settle();

    expect(started).toEqual(['a']);
    expect(pauses()).toEqual(['a', null]);
  });

  it('ignores the ends of nodes it did not let through', async () => {
    const { gate, ask, started, pauses } = setUp(true);
    ask('a');
    await settle();
    gate.next();
    await settle();
    ask('b');

    // A node skipped below another, or one that never asked, does not end the step.
    gate.observe(status('elsewhere', 'skipped'));
    gate.observe(status('elsewhere', 'done'));
    await settle();

    expect(started).toEqual(['a']);
    expect(pauses()).toEqual(['a', null]);
  });
});
