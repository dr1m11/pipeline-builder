import type { RunEvent } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { applyRunEvents, IDLE_NODE_RUN, IDLE_RUN, type RunState } from './run-state';

const RUNNING: RunState = { status: 'running', nodes: new Map() };

function status(
  nodeId: string,
  nodeStatus: Extract<RunEvent, { type: 'node-status' }>['status'],
): RunEvent {
  return { type: 'node-status', nodeId, status: nodeStatus };
}

function delta(nodeId: string, text: string): RunEvent {
  return { type: 'node-delta', nodeId, text };
}

const QUEUED: readonly RunEvent[] = [status('input', 'queued'), status('llm', 'queued')];

describe('applyRunEvents', () => {
  it('records the status of each node in the order the run reports them', () => {
    const state = applyRunEvents(RUNNING, [...QUEUED, status('input', 'running')]);

    expect(state.status).toBe('running');
    expect([...state.nodes]).toEqual([
      ['input', { status: 'running', text: '' }],
      ['llm', { status: 'queued', text: '' }],
    ]);
  });

  it('joins the streamed text of a node', () => {
    const state = applyRunEvents(RUNNING, [
      ...QUEUED,
      status('llm', 'running'),
      delta('llm', 'The sky '),
      delta('llm', 'is blue.'),
    ]);

    expect(state.nodes.get('llm')).toEqual({ status: 'running', text: 'The sky is blue.' });
  });

  it('keeps the text and the outputs of a node that ends', () => {
    const state = applyRunEvents(RUNNING, [
      ...QUEUED,
      status('llm', 'running'),
      delta('llm', 'Blue.'),
      { type: 'node-output', nodeId: 'llm', outputs: { response: 'Blue.' } },
      status('llm', 'done'),
    ]);

    expect(state.nodes.get('llm')).toEqual({
      status: 'done',
      text: 'Blue.',
      outputs: { response: 'Blue.' },
    });
  });

  it('records why a node failed or was skipped', () => {
    const error = { code: 'invalid-key', message: 'The API key was rejected.' } as const;
    const state = applyRunEvents(RUNNING, [
      ...QUEUED,
      status('input', 'running'),
      { type: 'node-status', nodeId: 'input', status: 'error', error },
      { type: 'node-status', nodeId: 'llm', status: 'skipped', skipReason: 'upstream-failed' },
    ]);

    expect(state.nodes.get('input')).toEqual({ status: 'error', text: '', error });
    expect(state.nodes.get('llm')).toEqual({
      status: 'skipped',
      text: '',
      skipReason: 'upstream-failed',
    });
  });

  it('takes a node that was not reported before as idle', () => {
    const state = applyRunEvents(RUNNING, [delta('late', 'Hi')]);

    expect(state.nodes.get('late')).toEqual({ ...IDLE_NODE_RUN, text: 'Hi' });
  });

  it('ends the run with the status it finished with', () => {
    const started = applyRunEvents(RUNNING, QUEUED);
    const state = applyRunEvents(started, [
      status('input', 'cancelled'),
      status('llm', 'cancelled'),
      { type: 'run-finished', status: 'cancelled' },
    ]);

    expect(state.status).toBe('cancelled');
    expect([...state.nodes.values()].map((node) => node.status)).toEqual([
      'cancelled',
      'cancelled',
    ]);
  });

  it('cancels the nodes a run that broke off left queued or running', () => {
    const started = applyRunEvents(RUNNING, [
      ...QUEUED,
      status('input', 'running'),
      status('input', 'done'),
      status('llm', 'running'),
      delta('llm', 'Half an'),
      status('third', 'queued'),
    ]);

    const state = applyRunEvents(started, [{ type: 'run-finished', status: 'error' }]);

    expect(state.status).toBe('error');
    expect(state.nodes.get('input')).toBe(started.nodes.get('input'));
    expect(state.nodes.get('llm')).toEqual({ status: 'cancelled', text: 'Half an' });
    expect(state.nodes.get('third')).toEqual({ status: 'cancelled', text: '' });
  });

  it('ignores events after the run finished, in the same batch or later', () => {
    const finished = applyRunEvents(RUNNING, [
      status('input', 'queued'),
      { type: 'run-finished', status: 'cancelled' },
      status('input', 'running'),
    ]);

    expect(finished.nodes.get('input')?.status).toBe('cancelled');
    expect(applyRunEvents(finished, [status('input', 'done')])).toBe(finished);
  });

  it('ignores events when no run is in progress', () => {
    expect(applyRunEvents(IDLE_RUN, QUEUED)).toBe(IDLE_RUN);
  });

  it('returns the same state for no events', () => {
    const started = applyRunEvents(RUNNING, QUEUED);

    expect(applyRunEvents(started, [])).toBe(started);
  });

  it('keeps the state objects of the nodes that did not change', () => {
    const started = applyRunEvents(RUNNING, [...QUEUED, status('llm', 'running')]);

    const state = applyRunEvents(started, [delta('llm', 'Hi')]);

    expect(state.nodes.get('input')).toBe(started.nodes.get('input'));
    expect(state.nodes.get('llm')).not.toBe(started.nodes.get('llm'));
    expect(started.nodes.get('llm')?.text).toBe('');
  });
});
