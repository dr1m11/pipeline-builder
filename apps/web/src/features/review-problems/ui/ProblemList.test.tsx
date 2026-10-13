import {
  addNode,
  createEmptyPipeline,
  type NodeKind,
  type Pipeline,
  type PipelineEdge,
  validatePipeline,
} from '@pipeline-builder/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Edge, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { useMemo } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PIPELINE_NODE_TYPE, PipelineNodeView, toFlowNode } from '@/entities/node';
import {
  createPipelineStore,
  PipelineStoreProvider,
  usePipelineStore,
  useValidationReport,
} from '@/entities/pipeline';

import type { FieldRevealRequest } from '../model/use-reveal-problem';
import { ProblemList } from './ProblemList';

const NODE_TYPES = { [PIPELINE_NODE_TYPE]: PipelineNodeView };

/** Nodes with the given ids and kinds, laid out in a row, joined by `edges`. */
function pipelineOf(nodes: [string, NodeKind][], edges: PipelineEdge[] = []): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'p', name: 'Test' });
  nodes.forEach(([id, kind], index) => {
    pipeline = addNode(pipeline, { kind, id, position: { x: index * 300, y: 0 } }).pipeline;
  });
  return { ...pipeline, edges };
}

/** A bare canvas of the store's pipeline, so problems have nodes and edges to focus. */
function Canvas() {
  const pipeline = usePipelineStore((state) => state.pipeline);
  const nodes = useMemo(() => pipeline.nodes.map((node) => toFlowNode(node)), [pipeline.nodes]);
  const edges = useMemo(
    () =>
      pipeline.edges.map((edge): Edge => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourcePort,
        target: edge.target,
        targetHandle: edge.targetPort,
        ariaLabel: `Edge ${edge.id}`,
      })),
    [pipeline.edges],
  );
  return (
    <div style={{ width: 1200, height: 600 }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} />
    </div>
  );
}

function Problems({ onRevealField }: { onRevealField?: (request: FieldRevealRequest) => void }) {
  const { issues } = useValidationReport();
  return <ProblemList issues={issues} label="Problems" onRevealField={onRevealField} />;
}

function renderProblems(pipeline: Pipeline, onRevealField?: (request: FieldRevealRequest) => void) {
  const store = createPipelineStore(pipeline);
  render(
    <PipelineStoreProvider store={store}>
      <ReactFlowProvider>
        <Canvas />
        <Problems onRevealField={onRevealField} />
      </ReactFlowProvider>
    </PipelineStoreProvider>,
  );
  const list = screen.getByRole('list', { name: 'Problems' });
  return { store, list, user: userEvent.setup() };
}

describe('ProblemList', () => {
  it('lists problems in report order, each with its severity, target and message', () => {
    const pipeline = pipelineOf([
      ['input', 'input'],
      ['prompt', 'prompt'],
    ]);
    const { list } = renderProblems(pipeline);

    const rows = within(list).getAllByRole('listitem');
    const messages = validatePipeline(pipeline).issues.map((issue) => issue.message);
    expect(rows).toHaveLength(messages.length);
    rows.forEach((row, index) => {
      expect(row).toHaveTextContent(messages[index] ?? '');
    });
    expect(
      within(list).getByRole('button', { name: 'Error: Input 1, Value: Required' }),
    ).toBeInTheDocument();
    expect(
      within(list).getByRole('button', {
        name: 'Error: Prompt 1, Input "question" is not connected',
      }),
    ).toBeInTheDocument();
  });

  it('lists a problem of the whole pipeline as text, not as a button', () => {
    const { list } = renderProblems(pipelineOf([['prompt', 'prompt']]));

    const warning = within(list).getByText(
      'The pipeline has no Output node, so a run would show nothing',
    );
    expect(warning.closest('button')).toBeNull();
    expect(within(list).getByText('Pipeline')).toBeInTheDocument();
  });

  it('selects the node of a problem and focuses it on the canvas', async () => {
    const { store, list, user } = renderProblems(pipelineOf([['prompt', 'prompt']]));

    await user.click(within(list).getByRole('button', { name: /Prompt 1, Input "question"/ }));

    expect(store.getState().selectedNodeIds).toEqual(new Set(['prompt']));
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Prompt 1' })).toHaveFocus();
    });
  });

  it('selects the edge of a problem and focuses it', async () => {
    const pipeline = pipelineOf(
      [
        ['transform', 'transform'],
        ['llm', 'llm-call'],
      ],
      [
        {
          id: 'e1',
          source: 'transform',
          sourcePort: 'result',
          target: 'llm',
          targetPort: 'prompt',
        },
      ],
    );
    const { store, list, user } = renderProblems(pipeline);

    await user.click(
      within(list).getByRole('button', { name: /Transform 1 result → LLM Call 1 prompt/ }),
    );

    expect(store.getState().selectedEdgeIds).toEqual(new Set(['e1']));
    expect(store.getState().selectedNodeIds).toEqual(new Set());
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Edge e1' })).toHaveFocus();
    });
  });

  it('selects every node of a cycle', async () => {
    const pipeline = pipelineOf(
      [
        ['a', 'transform'],
        ['b', 'transform'],
      ],
      [
        { id: 'ab', source: 'a', sourcePort: 'result', target: 'b', targetPort: 'value' },
        { id: 'ba', source: 'b', sourcePort: 'result', target: 'a', targetPort: 'value' },
      ],
    );
    const { store, list, user } = renderProblems(pipeline);

    await user.click(within(list).getByRole('button', { name: /Cycle: Transform 1, Transform 2/ }));

    expect(store.getState().selectedNodeIds).toEqual(new Set(['a', 'b']));
  });

  it('hands a field problem to the caller to focus the field', async () => {
    const onRevealField = vi.fn();
    const { store, list, user } = renderProblems(pipelineOf([['input', 'input']]), onRevealField);

    await user.click(within(list).getByRole('button', { name: /Input 1, Value: Required/ }));

    expect(store.getState().selectedNodeIds).toEqual(new Set(['input']));
    expect(onRevealField).toHaveBeenCalledExactlyOnceWith({ nodeId: 'input', field: 'value' });
    expect(screen.getByRole('group', { name: 'Input 1' })).not.toHaveFocus();
  });

  it('focuses the node of a field problem when nobody takes the field', async () => {
    const { list, user } = renderProblems(pipelineOf([['input', 'input']]));

    await user.click(within(list).getByRole('button', { name: /Input 1, Value: Required/ }));

    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Input 1' })).toHaveFocus();
    });
  });

  it('follows the pipeline as it changes', () => {
    const { store, list } = renderProblems(pipelineOf([['prompt', 'prompt']]));

    act(() => {
      store.getState().renameNode('prompt', 'Ask');
    });

    expect(within(list).getByRole('button', { name: /^Error: Ask,/ })).toBeInTheDocument();
  });
});
