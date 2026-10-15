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
