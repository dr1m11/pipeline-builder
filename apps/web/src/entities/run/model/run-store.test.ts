import type { RunEvent } from '@pipeline-builder/core';
import { describe, expect, it, vi } from 'vitest';

import { createRunStore } from './run-store';

const QUEUED: readonly RunEvent[] = [
  { type: 'node-status', nodeId: 'input', status: 'queued' },
  { type: 'node-status', nodeId: 'output', status: 'queued' },
];

describe('createRunStore', () => {
  it('starts idle, with no node reported', () => {
    const store = createRunStore();

    expect(store.getState().status).toBe('idle');
    expect(store.getState().nodes.size).toBe(0);
  });

  it('applies the events of a run it started, as one change', () => {
    const store = createRunStore();
    store.getState().start();
    const listener = vi.fn();
    store.subscribe(listener);

    store
      .getState()
      .applyEvents([...QUEUED, { type: 'node-status', nodeId: 'input', status: 'running' }]);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe('running');
    expect(store.getState().nodes.get('input')?.status).toBe('running');
    expect(store.getState().nodes.get('output')?.status).toBe('queued');
  });

  it('forgets the last run when the next one starts', () => {
    const store = createRunStore();
    store.getState().start();
    store.getState().applyEvents([...QUEUED, { type: 'run-finished', status: 'cancelled' }]);

    store.getState().start();

    expect(store.getState().status).toBe('running');
    expect(store.getState().nodes.size).toBe(0);
  });

  it('ignores events without a run in progress, and notifies nobody', () => {
    const store = createRunStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.getState().applyEvents(QUEUED);

    expect(listener).not.toHaveBeenCalled();
    expect(store.getState().nodes.size).toBe(0);
  });

  it('resets to idle, and notifies nobody when it is idle already', () => {
    const store = createRunStore();
    store.getState().start();
    store.getState().applyEvents(QUEUED);

    store.getState().reset();

    expect(store.getState().status).toBe('idle');
    expect(store.getState().nodes.size).toBe(0);
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().reset();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createRunStore step by step', () => {
  /** A store whose run goes step by step and has reported its nodes queued. */
  function stepping() {
    const store = createRunStore();
    store.getState().start({ stepping: true });
    store.getState().applyEvents(QUEUED);
    return store;
  }

  it('starts a run that goes step by step, or not', () => {
    const store = createRunStore();
    expect(store.getState()).toMatchObject({ stepping: false, pausedNodeId: null });

    store.getState().start({ stepping: true });
    expect(store.getState()).toMatchObject({ status: 'running', stepping: true });

    store.getState().start();
    expect(store.getState().stepping).toBe(false);
  });

  it('pauses before a node, and goes on', () => {
    const store = stepping();

    store.getState().setPausedNode('input');
    expect(store.getState().pausedNodeId).toBe('input');

    store.getState().setPausedNode(null);
    expect(store.getState().pausedNodeId).toBeNull();
  });

  it('does not pause a run that does not go step by step, or no run', () => {
    const store = createRunStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().setPausedNode('input');
    store.getState().setStepping(true);
    expect(listener).not.toHaveBeenCalled();

    store.getState().start();
    store.getState().setPausedNode('input');

    expect(store.getState().pausedNodeId).toBeNull();
  });

  it('stops pausing when the run stops going step by step, and starts again', () => {
    const store = stepping();
    store.getState().setPausedNode('input');

    store.getState().setStepping(false);
    expect(store.getState()).toMatchObject({ stepping: false, pausedNodeId: null });

    store.getState().setStepping(true);
    expect(store.getState()).toMatchObject({ stepping: true, pausedNodeId: null });
  });

  it('notifies nobody when nothing changes', () => {
    const store = stepping();
    store.getState().setPausedNode('input');
    const listener = vi.fn();
    store.subscribe(listener);

    store.getState().setPausedNode('input');
    store.getState().setStepping(true);

    expect(listener).not.toHaveBeenCalled();
  });

  it('forgets the pause when the run finishes, is reset or the next one starts', () => {
    const store = stepping();
    store.getState().setPausedNode('input');

    store.getState().applyEvents([{ type: 'run-finished', status: 'cancelled' }]);
    expect(store.getState()).toMatchObject({ stepping: false, pausedNodeId: null });

    for (const forget of [
      () => {
        store.getState().reset();
      },
      () => {
        store.getState().start({ stepping: true });
      },
    ]) {
      store.getState().start({ stepping: true });
      store.getState().setPausedNode('output');
      forget();
      expect(store.getState().pausedNodeId).toBeNull();
    }
  });
});
