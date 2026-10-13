import {
  addNode,
  createEmptyPipeline,
  type NodeKind,
  type Pipeline,
  type PipelineEdge,
} from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { type Edge, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { useMemo } from 'react';
import { expect, waitFor } from 'storybook/test';

import { PIPELINE_NODE_TYPE, PipelineNodeView, toFlowNode } from '@/entities/node';
import {
  createPipelineStore,
  PipelineStoreProvider,
  usePipelineStore,
  useValidationReport,
} from '@/entities/pipeline';

import { ProblemList } from './ProblemList';

const NODE_TYPES = { [PIPELINE_NODE_TYPE]: PipelineNodeView };

/** Nodes with the given ids and kinds, laid out in a row, joined by `edges`. */
function pipelineOf(nodes: [string, NodeKind][], edges: PipelineEdge[] = []): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'story', name: 'Story' });
  nodes.forEach(([id, kind], index) => {
    pipeline = addNode(pipeline, { kind, id, position: { x: index * 320, y: 0 } }).pipeline;
  });
  return { ...pipeline, edges };
}

/** A bare canvas of the store's pipeline, so the list has nodes and edges to go to. */
function Canvas() {
  const pipeline = usePipelineStore((state) => state.pipeline);
  const selected = usePipelineStore((state) => state.selectedNodeIds);
  const selectedEdges = usePipelineStore((state) => state.selectedEdgeIds);
  const nodes = useMemo(
    () => pipeline.nodes.map((node) => toFlowNode(node, { selected: selected.has(node.id) })),
    [pipeline.nodes, selected],
  );
  const edges = useMemo(
    () =>
      pipeline.edges.map((edge): Edge => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourcePort,
        target: edge.target,
        targetHandle: edge.targetPort,
        selected: selectedEdges.has(edge.id),
        ariaLabel: `Edge from ${edge.source} to ${edge.target}`,
      })),
    [pipeline.edges, selectedEdges],
  );
  return (
    <div className="h-80 min-w-0 flex-1 rounded-lg border border-border">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} fitView />
    </div>
  );
}

/** What the store has selected, so stories can check what a problem selects. */
function SelectionReadout() {
  const nodeIds = usePipelineStore((state) => state.selectedNodeIds);
  const edgeIds = usePipelineStore((state) => state.selectedEdgeIds);
  return (
    <p role="status" className="text-xs text-fg-muted">
      Selected: {[...nodeIds, ...edgeIds].join(', ') || 'nothing'}
    </p>
  );
}

function Problems() {
  const { issues } = useValidationReport();
  return <ProblemList issues={issues} label="Problems" />;
}

/** The problems of `pipeline` next to a canvas of it. */
function ProblemListPreview({ pipeline }: { pipeline: Pipeline }) {
  const store = useMemo(() => createPipelineStore(pipeline), [pipeline]);
  return (
    <PipelineStoreProvider store={store}>
      <ReactFlowProvider>
        <div className="flex w-[64rem] gap-4">
          <Canvas />
          <div className="flex w-80 flex-col gap-2 rounded-lg border border-border bg-surface p-2">
            <Problems />
            <SelectionReadout />
          </div>
        </div>
      </ReactFlowProvider>
    </PipelineStoreProvider>
  );
}

const meta = {
  title: 'features/ProblemList',
  component: ProblemListPreview,
  args: {
    pipeline: pipelineOf([
      ['prompt', 'prompt'],
      ['llm', 'llm-call'],
    ]),
  },
} satisfies Meta<typeof ProblemListPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NodeProblem: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Error: Prompt 1, Input "question" is not connected' }),
    );

    await expect(canvas.getByRole('status')).toHaveTextContent('Selected: prompt');
    await waitFor(() => expect(canvas.getByRole('group', { name: 'Prompt 1' })).toHaveFocus());
  },
};

export const EdgeProblem: Story = {
  args: {
    pipeline: pipelineOf(
      [
        ['transform', 'transform'],
        ['llm', 'llm-call'],
        ['output', 'output'],
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
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: /^Error: Transform 1 result → LLM Call 1 prompt/ }),
    );

    await expect(canvas.getByRole('status')).toHaveTextContent('Selected: e1');
    await waitFor(() =>
      expect(canvas.getByRole('group', { name: 'Edge from transform to llm' })).toHaveFocus(),
    );
  },
};

export const PipelineProblem: Story = {
  args: { pipeline: pipelineOf([['prompt', 'prompt']]) },
  play: async ({ canvas }) => {
    const warning = canvas.getByText(
      'The pipeline has no Output node, so a run would show nothing',
    );
    await expect(warning).toBeVisible();
    // There is nothing on the canvas to go to.
    await expect(warning.closest('button')).toBeNull();
  },
};
