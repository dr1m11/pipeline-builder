import {
  createEmptyPipeline,
  EMPTY_ISSUES,
  NODE_DEFINITIONS,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
  type PipelineEdge,
  type PipelineNode,
  validatePipeline,
} from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  type Edge,
  type NodeProps,
  type NodeTypes,
  type OnConnect,
  ReactFlow,
} from '@xyflow/react';
import { expect, fn, within } from 'storybook/test';

import { Badge } from '@/shared/ui/badge';

import { PIPELINE_NODE_TYPE, type PipelineFlowNode, toFlowNode } from '../model/flow-node';
import type { NodeRunSlots } from './NodeCard';
import { PipelineNodeView } from './PipelineNodeView';

const NODE_TYPES = { [PIPELINE_NODE_TYPE]: PipelineNodeView } satisfies NodeTypes;

/** Run UI with nothing to show, as before any run. */
function NothingYet() {
  return null;
}

const IDLE_RUN: NodeRunSlots = {
  status: <NothingYet />,
  preview: <NothingYet />,
  description: <NothingYet />,
};

/** The node with run slots that show nothing, as the canvas composes it before a run. */
function NodeWithIdleRun(props: NodeProps<PipelineFlowNode>) {
  return <PipelineNodeView {...props} run={IDLE_RUN} />;
}

const IDLE_RUN_NODE_TYPES = { [PIPELINE_NODE_TYPE]: NodeWithIdleRun } satisfies NodeTypes;

/** Run slots of the node a step-by-step run is paused before. */
const NEXT_RUN: NodeRunSlots = {
  status: <Badge tone="info">Next</Badge>,
  highlighted: true,
};

/** The node as the canvas shows it while a step-by-step run is paused before it. */
function NextNode(props: NodeProps<PipelineFlowNode>) {
  return <PipelineNodeView {...props} run={NEXT_RUN} />;
}

const NEXT_NODE_TYPES = { [PIPELINE_NODE_TYPE]: NextNode } satisfies NodeTypes;

function node<K extends NodeKind>(
  kind: K,
  label: string,
  options: { x?: number; data?: Partial<NodeDataMap[K]> } = {},
): NodeOfKind<K> {
  return {
    id: label,
    kind,
    label,
    position: { x: options.x ?? 0, y: 0 },
    data: { ...NODE_DEFINITIONS[kind].createData(), ...options.data },
  };
}

function flowNode(domainNode: PipelineNode, selected = false): PipelineFlowNode {
  return toFlowNode(domainNode, { selected });
}

/** The nodes with the issues `validatePipeline` finds for them, and their edges. */
function validated(nodes: PipelineNode[], edges: PipelineEdge[] = []) {
  const { byNode } = validatePipeline({
    ...createEmptyPipeline({ id: 'draft', name: 'Story' }),
    nodes,
    edges,
  });
  return {
    nodes: nodes.map((node) => toFlowNode(node, { issues: byNode.get(node.id) ?? EMPTY_ISSUES })),
    edges: edges.map((edge): Edge => ({
      id: edge.id,
      source: edge.source,
      sourceHandle: edge.sourcePort,
      target: edge.target,
      targetHandle: edge.targetPort,
      ariaLabel: `${edge.source} ${edge.sourcePort} to ${edge.target} ${edge.targetPort}`,
    })),
  };
}

interface NodesPreviewProps {
  nodes: PipelineFlowNode[];
  edges?: Edge[];
  onConnect?: OnConnect;
}

/** Nodes on a fixed-size canvas: React Flow needs a sized parent to measure and place them. */
function NodesPreview({ nodes, edges, onConnect }: NodesPreviewProps) {
  return (
    <div className="h-80 w-[44rem]">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={NODE_TYPES} onConnect={onConnect} fitView />
    </div>
  );
}

const meta = {
  title: 'entities/Node',
  component: NodesPreview,
  args: { nodes: [] },
} satisfies Meta<typeof NodesPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Input: Story = {
  args: { nodes: [flowNode(node('input', 'Input 1', { data: { value: 'What is RAG?' } }))] },
  play: async ({ canvas }) => {
    const card = await canvas.findByRole('group', { name: 'Input 1' });
    await expect(within(card).getByText('What is RAG?')).toBeVisible();
    await expect(within(card).getByRole('button', { name: 'Output value (text)' })).toBeVisible();
  },
};

export const Prompt: Story = {
  args: {
    nodes: [
      flowNode(
        node('prompt', 'Prompt 1', {
          data: { template: 'Summarize {{document}} for {{audience}}' },
        }),
      ),
    ],
  },
  play: async ({ canvas }) => {
    const card = await canvas.findByRole('group', { name: 'Prompt 1' });
    await expect(within(card).getByRole('button', { name: 'Input document (text)' })).toBeVisible();
    await expect(within(card).getByRole('button', { name: 'Input audience (text)' })).toBeVisible();
    await expect(within(card).getByRole('button', { name: 'Output prompt (text)' })).toBeVisible();
  },
};

export const LlmCall: Story = {
  args: { nodes: [flowNode(node('llm-call', 'LLM Call 1'))] },
};

export const Transform: Story = {
  args: { nodes: [flowNode(node('transform', 'Transform 1'))] },
  play: async ({ canvas }) => {
    const card = await canvas.findByRole('group', { name: 'Transform 1' });
    await expect(within(card).getByRole('button', { name: 'Input value (text)' })).toBeVisible();
    await expect(within(card).getByRole('button', { name: 'Output result (json)' })).toBeVisible();
  },
};

export const Condition: Story = {
  args: {
    nodes: [flowNode(node('condition', 'Is it spam?', { data: { operand: 'unsubscribe' } }))],
  },
  play: async ({ canvas }) => {
    const card = await canvas.findByRole('group', { name: 'Is it spam?' });
    // A renamed node still shows its kind.
    await expect(within(card).getByText('Condition')).toBeVisible();
    await expect(within(card).getByRole('button', { name: 'Output true (any)' })).toBeVisible();
    await expect(within(card).getByRole('button', { name: 'Output false (any)' })).toBeVisible();
  },
};

export const Output: Story = {
  args: { nodes: [flowNode(node('output', 'Output 1'))] },
};

export const Selected: Story = {
  args: { nodes: [flowNode(node('prompt', 'Prompt 1'), true)] },
};

export const ConnectWithKeyboard: Story = {
  args: {
    nodes: [flowNode(node('input', 'Input 1')), flowNode(node('prompt', 'Prompt 1', { x: 320 }))],
    onConnect: fn(),
  },
  play: async ({ args, canvas, userEvent }) => {
    const input = await canvas.findByRole('group', { name: 'Input 1' });
    const prompt = canvas.getByRole('group', { name: 'Prompt 1' });

    within(input).getByRole('button', { name: 'Output value (text)' }).focus();
    await userEvent.keyboard('{Enter}');
    within(prompt).getByRole('button', { name: 'Input question (text)' }).focus();
    await userEvent.keyboard(' ');

    await expect(args.onConnect).toHaveBeenCalledOnce();
    await expect(args.onConnect).toHaveBeenCalledWith({
      source: 'Input 1',
      sourceHandle: 'value',
      target: 'Prompt 1',
      targetHandle: 'question',
    });
  },
};

export const WithErrors: Story = {
  args: validated([node('llm-call', 'LLM Call 1', { data: { model: '' } })]),
  play: async ({ canvas }) => {
    const card = await canvas.findByRole('group', { name: 'LLM Call 1' });
    await expect(card).toHaveAccessibleDescription(
      /^2 problems: Input "prompt" is not connected\. Model: Required\. Press enter/,
    );
    await expect(within(card).getByText('2')).toBeVisible();
    await expect(
      within(card).getByRole('button', { name: 'Input prompt (text)' }),
    ).toHaveAccessibleDescription('Not connected');
  },
};

export const WithWarning: Story = {
  // Validated with an Output beside it, so the lone Input only warns that its result goes nowhere.
  args: {
    nodes: validated([
      node('input', 'Input 1', { data: { value: 'What is RAG?' } }),
      node('output', 'Output 1'),
    ]).nodes.slice(0, 1),
  },
  play: async ({ canvas }) => {
    const card = await canvas.findByRole('group', { name: 'Input 1' });
    await expect(card).toHaveAccessibleDescription(
      /^1 problem: Its result does not reach any Output\./,
    );
    await expect(within(card).getByText('1')).toBeVisible();
  },
};

export const RemovedPort: Story = {
  // The template lost `{{question}}`, but the edge into it stays until it is deleted.
  args: validated(
    [
      node('input', 'Input 1', { data: { value: 'Why?' } }),
      node('prompt', 'Prompt 1', { x: 320, data: { template: 'Tell a joke' } }),
    ],
    [
      {
        id: 'e1',
        source: 'Input 1',
        sourcePort: 'value',
        target: 'Prompt 1',
        targetPort: 'question',
      },
    ],
  ),
  play: async ({ canvas }) => {
    const card = await canvas.findByRole('group', { name: 'Prompt 1' });
    await expect(within(card).getByText('removed')).toBeVisible();
    await expect(card).toHaveAccessibleDescription(
      /^1 problem: Input "question" no longer exists\./,
    );
    // React Flow draws no edge whose handle is missing: the placeholder keeps this one drawn.
    await expect(
      await canvas.findByRole('group', { name: 'Input 1 value to Prompt 1 question' }),
    ).toBeVisible();
  },
};

/**
 * Run slots that show nothing take no room: the card lays out as it does without them (on the
 * left), so the summary keeps its width.
 */
export const IdleRunSlots: Story = {
  render: () => (
    <div className="flex gap-4">
      {[
        { label: 'Without run', nodeTypes: NODE_TYPES },
        { label: 'With idle run', nodeTypes: IDLE_RUN_NODE_TYPES },
      ].map(({ label, nodeTypes }) => (
        <div key={label} className="h-60 w-80">
          <ReactFlow
            nodes={[flowNode(node('input', label, { data: { value: 'What is RAG?' } }))]}
            nodeTypes={nodeTypes}
            fitView
          />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const summaryWidth = async (name: string) => {
      const card = await canvas.findByRole('group', { name });
      return within(card).getByText('What is RAG?').getBoundingClientRect().width;
    };
    await expect(await summaryWidth('With idle run')).toBeCloseTo(
      await summaryWidth('Without run'),
      1,
    );
  },
};

/** The card inside React Flow's wrapper of a node, which has the node's role and name. */
function cardOf(node: HTMLElement): Element {
  const card = node.firstElementChild;
  if (card === null) throw new Error('The node has no card');
  return card;
}

/**
 * The node a step-by-step run is paused before gets a frame of its own, so a selected one keeps
 * the selection's ring and border inside that frame.
 */
export const SelectedAndNext: Story = {
  render: () => (
    <div className="flex gap-4">
      {[
        { nodeTypes: NODE_TYPES, nodes: [flowNode(node('input', 'Selected'), true)] },
        {
          nodeTypes: NEXT_NODE_TYPES,
          nodes: [
            flowNode(node('input', 'Selected and next'), true),
            flowNode(node('input', 'Next', { x: 320 })),
          ],
        },
      ].map(({ nodeTypes, nodes }) => (
        <div key={nodes[0]?.id} className="h-60 w-[36rem]">
          <ReactFlow nodes={nodes} nodeTypes={nodeTypes} fitView />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const selected = cardOf(await canvas.findByRole('group', { name: 'Selected' }));
    const both = cardOf(await canvas.findByRole('group', { name: 'Selected and next' }));
    const next = cardOf(await canvas.findByRole('group', { name: 'Next' }));
    const frame = (card: Element) => getComputedStyle(card, '::before').borderTopWidth;

    // The selection's ring (a box shadow) and border are the same with the frame as without.
    await expect(getComputedStyle(both).boxShadow).toBe(getComputedStyle(selected).boxShadow);
    await expect(getComputedStyle(both).borderTopColor).toBe(
      getComputedStyle(selected).borderTopColor,
    );
    await expect(getComputedStyle(next).boxShadow).not.toBe(getComputedStyle(both).boxShadow);
    await expect(frame(both)).toBe('2px');
    await expect(frame(next)).toBe('2px');
    await expect(frame(selected)).toBe('0px');
  },
};
