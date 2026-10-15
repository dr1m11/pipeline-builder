import { createNode, type RunEvent } from '@pipeline-builder/core';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { createRunStore } from '../model/run-store';
import { RunStoreProvider } from '../model/RunStoreProvider';
import { NodeRunDescription } from './NodeRunDescription';
import { NodeRunDetails } from './NodeRunDetails';
import { NodeRunPreview } from './NodeRunPreview';
import { NodeRunBadge } from './RunStatusBadge';

/** Renders `children` over a run store in which a run has reported `events`. */
function renderWithRun(children: ReactNode, events: readonly RunEvent[] = []) {
  const store = createRunStore();
  store.getState().start();
  store.getState().applyEvents(events);
  render(<RunStoreProvider store={store}>{children}</RunStoreProvider>);
  const apply = (more: readonly RunEvent[]) => {
    act(() => {
      store.getState().applyEvents(more);
    });
  };
  return { store, apply };
}

function status(
  nodeId: string,
  nodeStatus: Extract<RunEvent, { type: 'node-status' }>['status'],
): RunEvent {
  return { type: 'node-status', nodeId, status: nodeStatus };
}

const model = createNode('llm-call', { id: 'model', label: 'Model', position: { x: 0, y: 0 } });
const condition = createNode('condition', {
  id: 'check',
  label: 'Is positive?',
  position: { x: 0, y: 0 },
});
const output = createNode('output', { id: 'answer', label: 'Answer', position: { x: 0, y: 0 } });

describe('NodeRunBadge', () => {
  it('shows nothing for a node no run has reported', () => {
    renderWithRun(<NodeRunBadge nodeId="model" />);

    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  it('names each status in words', () => {
    const statuses = ['queued', 'running', 'done', 'error', 'cancelled', 'skipped'] as const;
    renderWithRun(
      <ul>
        {statuses.map((id) => (
          <li key={id}>
            <NodeRunBadge nodeId={id} />
          </li>
        ))}
      </ul>,
      statuses.map((id) => status(id, id)),
    );

    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Queued',
      'Running',
      'Done',
      'Failed',
      'Cancelled',
      'Skipped',
    ]);
  });
});

describe('NodeRunDescription', () => {
  it('describes what the run did to the node', () => {
    const { apply } = renderWithRun(
      <p>
        Model. <NodeRunDescription nodeId="model" />
      </p>,
    );
    expect(screen.getByText(/^Model\./)).toHaveTextContent(/^Model\.$/);

    apply([
      {
        type: 'node-status',
        nodeId: 'model',
        status: 'error',
        error: { code: 'timeout', message: 'The model took too long to answer.' },
      },
    ]);

    expect(screen.getByText(/^Model\./)).toHaveTextContent(
      'Model. Run status: failed. The model took too long to answer.',
    );
  });
});

describe('NodeRunPreview', () => {
  const preview = () => screen.getByRole('textbox', { name: 'Model response' });

  it('shows the response as it streams, line breaks kept, in a read-only field', () => {
    const { apply } = renderWithRun(
      <NodeRunPreview nodeId="model" port="response" label="Model response" />,
      [status('model', 'running')],
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    apply([
      { type: 'node-delta', nodeId: 'model', text: 'Line one\n' },
      { type: 'node-delta', nodeId: 'model', text: '  Line two' },
    ]);

    expect(preview()).toHaveAttribute('aria-readonly', 'true');
    expect(preview().textContent).toBe('Line one\n  Line two');
  });

  it('shows the value of an Output, other values than text as JSON', () => {
    renderWithRun(<NodeRunPreview nodeId="answer" port="value" label="Answer result" />, [
      { type: 'node-output', nodeId: 'answer', outputs: { value: { name: 'Ada' } } },
      status('answer', 'done'),
    ]);

    expect(screen.getByRole('textbox', { name: 'Answer result' }).textContent).toBe(
      '{\n  "name": "Ada"\n}',
    );
  });

  it('says why the node failed', () => {
    renderWithRun(<NodeRunPreview nodeId="parse" label="Parse result" />, [
      {
        type: 'node-status',
        nodeId: 'parse',
        status: 'error',
        error: { code: 'invalid-json', message: 'Input "value" is not valid JSON' },
      },
    ]);

    expect(screen.getByText('Input "value" is not valid JSON')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows no text for a node whose kind has none to show', () => {
    renderWithRun(<NodeRunPreview nodeId="prompt" label="Prompt result" />, [
      { type: 'node-output', nodeId: 'prompt', outputs: { prompt: 'Why?' } },
      status('prompt', 'done'),
    ]);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('NodeRunDetails', () => {
  it('shows nothing for a node no run has reported', () => {
    renderWithRun(<NodeRunDetails node={model} />);

    expect(screen.queryByText(/./)).not.toBeInTheDocument();
  });

  it('shows the response streamed so far, then the output under its port', () => {
    const { apply } = renderWithRun(<NodeRunDetails node={model} />, [
      status('model', 'running'),
      { type: 'node-delta', nodeId: 'model', text: 'Because of' },
    ]);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'response (so far)' })).toHaveTextContent(
      'Because of',
    );

    apply([
      { type: 'node-delta', nodeId: 'model', text: ' scattering.' },
      { type: 'node-output', nodeId: 'model', outputs: { response: 'Because of scattering.' } },
      status('model', 'done'),
    ]);

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: 'response' })).toHaveTextContent(
      'Because of scattering.',
    );
  });

  it('names the branch a Condition took', () => {
    renderWithRun(<NodeRunDetails node={condition} />, [
      { type: 'node-output', nodeId: 'check', outputs: { true: { mood: 'positive' } } },
      status('check', 'done'),
    ]);

    expect(screen.getByRole('figure', { name: 'true' })).toHaveTextContent(
      'true{\n  "mood": "positive"\n}',
      { normalizeWhitespace: false },
    );
  });

  it('calls the value of an Output its result', () => {
    renderWithRun(<NodeRunDetails node={output} />, [
      { type: 'node-output', nodeId: 'answer', outputs: { value: 'Blue.' } },
      status('answer', 'done'),
    ]);

    expect(screen.getByRole('figure', { name: 'result' })).toHaveTextContent('Blue.');
  });

  it('says why the node failed or was skipped', () => {
    renderWithRun(
      <>
        <NodeRunDetails node={model} />
        <NodeRunDetails node={output} />
      </>,
      [
        {
          type: 'node-status',
          nodeId: 'model',
          status: 'error',
          error: { code: 'invalid-key', message: 'The API key was rejected.' },
        },
        { type: 'node-status', nodeId: 'answer', status: 'skipped', skipReason: 'upstream-failed' },
      ],
    );

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('The API key was rejected.')).toBeInTheDocument();
    expect(screen.getByText('Skipped')).toBeInTheDocument();
    expect(screen.getByText('Because a node it depends on failed')).toBeInTheDocument();
  });
});
