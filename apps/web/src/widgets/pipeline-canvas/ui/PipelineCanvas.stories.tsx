import {
  addNode,
  connect,
  createEmptyPipeline,
  type NodeKind,
  type Pipeline,
  updateNodeData,
} from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { Button } from '@/shared/ui/button';

import { PipelineCanvas } from './PipelineCanvas';

/** Input → Prompt → LLM Call, side by side. */
function chain(): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'draft', name: 'Story' });
  pipeline = addNode(pipeline, { kind: 'input', id: 'input', position: { x: 0, y: 0 } }).pipeline;
  pipeline = addNode(pipeline, {
    kind: 'prompt',
    id: 'prompt',
    position: { x: 320, y: 0 },
  }).pipeline;
  pipeline = addNode(pipeline, {
    kind: 'llm-call',
    id: 'llm',
    position: { x: 640, y: 0 },
  }).pipeline;
  for (const [candidate, id] of [
    [{ source: 'input', sourcePort: 'value', target: 'prompt', targetPort: 'question' }, 'e1'],
    [{ source: 'prompt', sourcePort: 'prompt', target: 'llm', targetPort: 'prompt' }, 'e2'],
  ] as const) {
    const result = connect(pipeline, candidate, id);
    if (!result.ok) throw new Error(result.error);
    pipeline = result.value.pipeline;
  }
  return pipeline;
}

const INPUT_TO_PROMPT = 'Input 1 value to Prompt 1 question';
const PROMPT_TO_LLM = 'Prompt 1 prompt to LLM Call 1 prompt';

/** Unconnected nodes of the given kinds in a row, with their kinds as ids. */
function row(...kinds: NodeKind[]): Pipeline {
  return kinds.reduce(
    (pipeline, kind, index) =>
      addNode(pipeline, { kind, id: kind, position: { x: index * 320, y: 0 } }).pipeline,
    createEmptyPipeline({ id: 'draft', name: 'Story' }),
  );
}

/** `pipeline` with the data of node `nodeId` changed; fails the story on invalid data. */
function withData(
  pipeline: Pipeline,
  nodeId: string,
  changes: Readonly<Record<string, unknown>>,
): Pipeline {
  const result = updateNodeData(pipeline, nodeId, changes);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/**
 * Edges the editor no longer allows, as a pipeline can hold them after its nodes change: the
 * Prompt lost `{{question}}`, and the Transform outputs JSON into a text input.
 */
function broken(): Pipeline {
  let pipeline = row('input', 'prompt', 'transform', 'llm-call');
  pipeline = withData(pipeline, 'input', { value: 'Why?' });
  pipeline = withData(pipeline, 'prompt', { template: 'Tell a joke' });
  return {
    ...pipeline,
    edges: [
      { id: 'e1', source: 'input', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
      {
        id: 'e2',
        source: 'transform',
        sourcePort: 'result',
        target: 'llm-call',
        targetPort: 'prompt',
      },
    ],
  };
}

interface CanvasPreviewProps {
  pipeline: Pipeline;
}

/** The canvas over its own store, at a fixed size: React Flow needs a sized parent. */
function CanvasPreview({ pipeline }: CanvasPreviewProps) {
  const store = useMemo(() => createPipelineStore(pipeline), [pipeline]);
  return (
    <PipelineStoreProvider store={store}>
      <div className="h-[30rem] w-[60rem]">
        <PipelineCanvas />
      </div>
    </PipelineStoreProvider>
  );
}

/**
 * The chain with a two-variable Prompt, and a button that swaps the variables: the edge into
 * `question` must follow its handle to the second row although the node keeps its size.
 */
function TemplateSwapPreview() {
  const store = useMemo(
    () =>
      createPipelineStore(withData(chain(), 'prompt', { template: '{{question}} {{context}}' })),
    [],
  );
  const swap = () => {
    const { pipeline } = store.getState();
    // The properties panel edits data through store actions; here the story stands in for it.
    store.setState({
      pipeline: withData(pipeline, 'prompt', { template: '{{context}} {{question}}' }),
    });
  };
  return (
    <PipelineStoreProvider store={store}>
      <Button onClick={swap}>Swap the variables</Button>
      <div className="h-[30rem] w-[60rem]">
        <PipelineCanvas />
      </div>
    </PipelineStoreProvider>
  );
}

/** Where an SVG path ends, in viewport coordinates. */
function pathEnd(path: SVGPathElement): Point {
  const end = path.getPointAtLength(path.getTotalLength());
  const matrix = path.getScreenCTM();
  if (matrix === null) throw new Error('Edge path is not rendered');
  const point = new DOMPoint(end.x, end.y).matrixTransform(matrix);
  return { x: point.x, y: point.y };
}

/** The drawn path of the edge with id `edgeId`; the edge's own element has no geometry. */
function edgePath(canvasElement: HTMLElement, edgeId: string): SVGPathElement {
  const path = canvasElement.querySelector(`[data-id="${edgeId}"] path.react-flow__edge-path`);
  if (!(path instanceof SVGPathElement)) throw new Error(`Edge ${edgeId} has no path`);
  return path;
}

interface Point {
  x: number;
  y: number;
}

function centerOf(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// React Flow drags nodes with d3-drag, which needs `event.view`; user-event leaves it unset, so
// node gestures dispatch mouse events the way a browser does.
function mouse(type: string, target: EventTarget, at: Point): void {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX: at.x,
      clientY: at.y,
    }),
  );
}

function clickNode(node: HTMLElement): void {
  const at = centerOf(node);
  mouse('mousedown', node, at);
  mouse('mouseup', window, at);
  mouse('click', node, at);
}

/** Picks a node up, moves it by `by` and drops it. */
function dragNode(node: HTMLElement, by: Point): void {
  const start = centerOf(node);
  // React Flow starts a drag once the pointer has moved, and that first move does not move the node.
  const pickup = { x: start.x, y: start.y + 4 };
  mouse('mousedown', node, start);
  mouse('mousemove', window, pickup);
  for (const step of [0.25, 0.5, 0.75, 1]) {
    mouse('mousemove', window, { x: pickup.x + by.x * step, y: pickup.y + by.y * step });
  }
  mouse('mouseup', window, { x: pickup.x + by.x, y: pickup.y + by.y });
}

/** The port button `portName` on the node `nodeName`. */
async function findPort(canvas: HTMLElement, nodeName: string, portName: string) {
  const node = await within(canvas).findByRole('group', { name: nodeName });
  return within(node).getByRole('button', { name: portName });
}

const meta = {
  title: 'widgets/PipelineCanvas',
  component: CanvasPreview,
  args: { pipeline: chain() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof CanvasPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    for (const name of ['Input 1', 'Prompt 1', 'LLM Call 1']) {
      await expect(await canvas.findByRole('group', { name })).toBeVisible();
    }
    await expect(canvas.getByRole('group', { name: INPUT_TO_PROMPT })).toBeVisible();
    await expect(canvas.getByRole('group', { name: PROMPT_TO_LLM })).toBeVisible();
  },
};

export const DragNode: Story = {
  play: async ({ canvas }) => {
    const node = await canvas.findByRole('group', { name: 'Input 1' });
    const before = node.getBoundingClientRect();

    dragNode(node, { x: 40, y: 120 });

    // The node stays where it was dropped: the drop moved it in the pipeline.
    await waitFor(async () => {
      const after = node.getBoundingClientRect();
      await expect(after.left - before.left).toBeCloseTo(40, 0);
      await expect(after.top - before.top).toBeCloseTo(120, 0);
    });
  },
};

export const DeleteSelectedNode: Story = {
  play: async ({ canvas, userEvent }) => {
    clickNode(await canvas.findByRole('group', { name: 'Prompt 1' }));
    await userEvent.keyboard('{Delete}');

    await waitFor(async () => {
      await expect(canvas.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument();
    });
    await expect(canvas.queryByRole('group', { name: INPUT_TO_PROMPT })).not.toBeInTheDocument();
    await expect(canvas.queryByRole('group', { name: PROMPT_TO_LLM })).not.toBeInTheDocument();
    await expect(canvas.getByRole('group', { name: 'Input 1' })).toBeVisible();
    await expect(canvas.getByRole('group', { name: 'LLM Call 1' })).toBeVisible();
  },
};

export const SelectSeveralNodes: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByRole('group', { name: 'Input 1' });
    const llm = canvas.getByRole('group', { name: 'LLM Call 1' });

    await userEvent.keyboard('{Control>}');
    clickNode(input);
    clickNode(llm);
    await userEvent.keyboard('{/Control}');
    await userEvent.keyboard('{Backspace}');

    await waitFor(async () => {
      await expect(canvas.queryByRole('group', { name: 'Input 1' })).not.toBeInTheDocument();
    });
    await expect(canvas.queryByRole('group', { name: 'LLM Call 1' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('group', { name: 'Prompt 1' })).toBeVisible();
  },
};

export const SelectWithRectangle: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const input = (await canvas.findByRole('group', { name: 'Input 1' })).getBoundingClientRect();
    const prompt = canvas.getByRole('group', { name: 'Prompt 1' }).getBoundingClientRect();
    // The pane has no role or name to query it by.
    const pane = canvasElement.querySelector('.react-flow__pane');
    if (pane === null) throw new Error('React Flow pane not found');

    await userEvent.keyboard('{Shift>}');
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: pane, coords: { x: input.left - 16, y: input.top - 16 } },
      { target: pane, coords: { x: prompt.right + 16, y: prompt.bottom + 16 } },
      { keys: '[/MouseLeft]', target: pane },
    ]);
    await userEvent.keyboard('{/Shift}');
    await userEvent.keyboard('{Delete}');

    await waitFor(async () => {
      await expect(canvas.queryByRole('group', { name: 'Input 1' })).not.toBeInTheDocument();
    });
    await expect(canvas.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument();
    await expect(canvas.getByRole('group', { name: 'LLM Call 1' })).toBeVisible();
  },
};

export const ConnectWithKeyboard: Story = {
  args: { pipeline: row('input', 'prompt') },
  play: async ({ canvas, canvasElement, userEvent }) => {
    (await findPort(canvasElement, 'Input 1', 'Output value (text)')).focus();
    await userEvent.keyboard('{Enter}');
    (await findPort(canvasElement, 'Prompt 1', 'Input question (text)')).focus();
    await userEvent.keyboard('{Enter}');

    await expect(await canvas.findByRole('group', { name: INPUT_TO_PROMPT })).toBeVisible();
  },
};

export const ReplaceOccupiedInput: Story = {
  args: {
    pipeline: addNode(chain(), { kind: 'input', id: 'input-2', position: { x: 0, y: 240 } })
      .pipeline,
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    (await findPort(canvasElement, 'Input 2', 'Output value (text)')).focus();
    await userEvent.keyboard('{Enter}');
    (await findPort(canvasElement, 'Prompt 1', 'Input question (text)')).focus();
    await userEvent.keyboard('{Enter}');

    // An input takes one edge: the new one replaces the old.
    await expect(
      await canvas.findByRole('group', { name: 'Input 2 value to Prompt 1 question' }),
    ).toBeVisible();
    await expect(canvas.queryByRole('group', { name: INPUT_TO_PROMPT })).not.toBeInTheDocument();
  },
};

export const HighlightCompatiblePorts: Story = {
  args: { pipeline: row('transform', 'llm-call', 'output') },
  play: async ({ canvas, canvasElement }) => {
    const result = await findPort(canvasElement, 'Transform 1', 'Output result (json)');
    const prompt = await findPort(canvasElement, 'LLM Call 1', 'Input prompt (text)');
    const output = await findPort(canvasElement, 'Output 1', 'Input value (any)');

    // React Flow follows a dragged connection on the document.
    const start = centerOf(result);
    mouse('mousedown', result, start);
    mouse('mousemove', document, { x: start.x + 40, y: start.y + 40 });

    await waitFor(async () => {
      await expect(prompt).toHaveAttribute('aria-disabled', 'true');
    });
    await expect(output).not.toHaveAttribute('aria-disabled');

    // Dropped on an incompatible port, the connection is refused.
    mouse('mousemove', document, centerOf(prompt));
    mouse('mouseup', document, centerOf(prompt));
    await waitFor(async () => {
      await expect(prompt).not.toHaveAttribute('aria-disabled');
    });

    mouse('mousedown', result, start);
    mouse('mousemove', document, { x: start.x + 40, y: start.y + 40 });
    mouse('mousemove', document, centerOf(output));
    mouse('mouseup', document, centerOf(output));
    await expect(
      await canvas.findByRole('group', { name: 'Transform 1 result to Output 1 value' }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('group', { name: 'Transform 1 result to LLM Call 1 prompt' }),
    ).not.toBeInTheDocument();
  },
};

export const BrokenPipeline: Story = {
  args: { pipeline: broken() },
  play: async ({ canvas, userEvent }) => {
    const removed = await canvas.findByRole('group', {
      name: 'Input 1 value to Prompt 1 question, error: Input "question" no longer exists',
    });
    const mismatch = canvas.getByRole('group', {
      name: 'Transform 1 result to LLM Call 1 prompt, error: Connects json to text; convert it with a Transform node',
    });
    await expect(removed).toHaveClass('edge-invalid');
    await expect(mismatch).toHaveClass('edge-invalid');
    const prompt = canvas.getByRole('group', { name: 'Prompt 1' });
    await expect(within(prompt).getByText('removed')).toBeVisible();

    // A broken edge can still be selected and deleted, and its placeholder port goes with it.
    removed.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard('{Delete}');

    await waitFor(async () => {
      await expect(
        canvas.queryByRole('group', { name: /^Input 1 value to Prompt 1 question/ }),
      ).not.toBeInTheDocument();
    });
    await expect(within(prompt).queryByText('removed')).not.toBeInTheDocument();
  },
};

export const HandlesFollowTheTemplate: Story = {
  render: () => <TemplateSwapPreview />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const before = centerOf(await findPort(canvasElement, 'Prompt 1', 'Input question (text)'));

    await userEvent.click(canvas.getByRole('button', { name: 'Swap the variables' }));

    await waitFor(async () => {
      const port = await findPort(canvasElement, 'Prompt 1', 'Input question (text)');
      const center = centerOf(port);
      await expect(center.y - before.y).toBeGreaterThan(10);
      // React Flow ends an edge at the middle of the handle's outer side.
      const end = pathEnd(edgePath(canvasElement, 'e1'));
      await expect(Math.abs(end.y - center.y)).toBeLessThan(2);
      await expect(Math.abs(end.x - port.getBoundingClientRect().left)).toBeLessThan(2);
    });
  },
};
