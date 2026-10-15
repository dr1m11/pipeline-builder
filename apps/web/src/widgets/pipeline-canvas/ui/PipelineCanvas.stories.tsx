import {
  addNode,
  connect,
  createEmptyPipeline,
  type NodeKind,
  type NodeValues,
  type Pipeline,
  PIPELINE_TEMPLATES,
  type PipelineTemplateId,
  type RunEvent,
  updateNodeData,
} from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useMemo } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { createRunStore, RunStoreProvider } from '@/entities/run';
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
  /** Events of a run in progress, or of a run that `run-finished` ended; none by default. */
  run?: readonly RunEvent[];
  /** The node the run in progress is paused before, step by step; none by default. */
  pausedBefore?: string;
}

/** The canvas over its own stores, at a fixed size: React Flow needs a sized parent. */
function CanvasPreview({ pipeline, run = [], pausedBefore }: CanvasPreviewProps) {
  const store = useMemo(() => createPipelineStore(pipeline), [pipeline]);
  const runStore = useMemo(() => {
    const created = createRunStore();
    if (run.length > 0) {
      created.getState().start({ stepping: pausedBefore !== undefined });
      created.getState().applyEvents(run);
      if (pausedBefore !== undefined) created.getState().setPausedNode(pausedBefore);
    }
    return created;
  }, [run, pausedBefore]);
  return (
    <PipelineStoreProvider store={store}>
      <RunStoreProvider store={runStore}>
        <div className="h-[30rem] w-[60rem]">
          <PipelineCanvas />
        </div>
      </RunStoreProvider>
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
  const runStore = useMemo(() => createRunStore(), []);
  const swap = () => {
    const { pipeline } = store.getState();
    // The properties panel edits data through store actions; here the story stands in for it.
    store.setState({
      pipeline: withData(pipeline, 'prompt', { template: '{{context}} {{question}}' }),
    });
  };
  return (
    <PipelineStoreProvider store={store}>
      <RunStoreProvider store={runStore}>
        <Button onClick={swap}>Swap the variables</Button>
        <div className="h-[30rem] w-[60rem]">
          <PipelineCanvas />
        </div>
      </RunStoreProvider>
    </PipelineStoreProvider>
  );
}

/** One Output node far from where the chain lies. */
function farAway(): Pipeline {
  return addNode(createEmptyPipeline({ id: 'far', name: 'Far away' }), {
    kind: 'output',
    id: 'far',
    position: { x: 4000, y: 2400 },
  }).pipeline;
}

/**
 * The chain with buttons that replace the whole document, as an import or a new pipeline does, and
 * that add a node and undo; the stories check where the view goes.
 */
function ReplaceDocumentPreview() {
  const store = useMemo(() => createPipelineStore(chain()), []);
  const runStore = useMemo(() => createRunStore(), []);
  const actions = store.getState();
  return (
    <PipelineStoreProvider store={store}>
      <RunStoreProvider store={runStore}>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              actions.replacePipeline(farAway(), 'import');
            }}
          >
            Import a distant pipeline
          </Button>
          <Button
            onClick={() => {
              actions.replacePipeline(createEmptyPipeline({ id: 'new', name: 'New' }), 'new');
            }}
          >
            New pipeline
          </Button>
          <Button
            onClick={() => {
              actions.addNode('input', { x: 0, y: 0 });
            }}
          >
            Add an Input
          </Button>
          <Button
            onClick={() => {
              actions.undo();
            }}
          >
            Undo
          </Button>
        </div>
        <div className="h-[30rem] w-[60rem]">
          <PipelineCanvas />
        </div>
      </RunStoreProvider>
    </PipelineStoreProvider>
  );
}

/** Zooms in twice as close, on the middle of the view, at once. */
function ZoomInButton() {
  const { zoomTo } = useReactFlow();
  return (
    <Button
      onClick={() => {
        void zoomTo(2);
      }}
    >
      Zoom in on the middle
    </Button>
  );
}

/**
 * "Ask a question" in a run that goes step by step, with buttons that pause it before a node, as
 * the runner does; the story checks that the canvas brings that node into view.
 */
function PausedNodeRevealPreview() {
  const pipeline = template('ask-a-question');
  const store = useMemo(() => createPipelineStore(pipeline), [pipeline]);
  const runStore = useMemo(() => {
    const created = createRunStore();
    created.getState().start({ stepping: true });
    created.getState().applyEvents(queued(pipeline));
    return created;
  }, [pipeline]);
  return (
    <PipelineStoreProvider store={store}>
      <RunStoreProvider store={runStore}>
        <ReactFlowProvider>
          <div className="flex gap-2">
            <ZoomInButton />
            {pipeline.nodes.map((node) => (
              <Button
                key={node.id}
                onClick={() => {
                  runStore.getState().setPausedNode(node.id);
                }}
              >
                Pause before {node.label}
              </Button>
            ))}
          </div>
          <div className="h-[30rem] w-[60rem]">
            <PipelineCanvas />
          </div>
        </ReactFlowProvider>
      </RunStoreProvider>
    </PipelineStoreProvider>
  );
}

/** Whether `inner` lies wholly inside `outer` on screen. */
function isInside(inner: Element, outer: Element): boolean {
  const a = inner.getBoundingClientRect();
  const b = outer.getBoundingClientRect();
  return a.left >= b.left && a.top >= b.top && a.right <= b.right && a.bottom <= b.bottom;
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

/** The pipeline of a built-in template, with its readable labels and ids. */
function template(id: PipelineTemplateId): Pipeline {
  const found = PIPELINE_TEMPLATES.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`No template "${id}"`);
  return found.pipeline;
}

/** Run events: every node of `pipeline` queued, as a run starts. */
function queued(pipeline: Pipeline): RunEvent[] {
  return pipeline.nodes.map((node) => ({ type: 'node-status', nodeId: node.id, status: 'queued' }));
}

/** Run events: `nodeId` runs and ends with `outputs`. */
function done(nodeId: string, outputs: NodeValues): RunEvent[] {
  return [
    { type: 'node-status', nodeId, status: 'running' },
    { type: 'node-output', nodeId, outputs },
    { type: 'node-status', nodeId, status: 'done' },
  ];
}

/** Run events: `nodeId`, an LLM Call, streams `text` line by line. */
function streams(nodeId: string, text: string): RunEvent[] {
  return [
    { type: 'node-status', nodeId, status: 'running' },
    ...text.split(/(?<=\n)/).map((line): RunEvent => ({ type: 'node-delta', nodeId, text: line })),
  ];
}

// Longer than a card shows: its last lines are in view, and the rest scrolls.
const ANSWER = [
  'The sky looks blue because air scatters sunlight.',
  'Short blue waves scatter far more than red ones,',
  'so blue light reaches your eyes from every part of the sky.',
  'At sunset the light crosses more air,',
  'the blue is scattered away before it arrives,',
  'and the reds and oranges are left.',
].join('\n');

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

export const FitReplacedDocument: Story = {
  render: () => <ReplaceDocumentPreview />,
  play: async ({ canvas, userEvent }) => {
    const flow = canvas.getByRole('application');
    await expect(await canvas.findByRole('group', { name: 'Prompt 1' })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Import a distant pipeline' }));

    // The view moves to the new document, wherever its nodes are.
    const output = await canvas.findByRole('group', { name: 'Output 1' });
    await waitFor(() => expect(isInside(output, flow)).toBe(true));

    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));

    // Undoing the replacement brings the old document back into view.
    const prompt = await canvas.findByRole('group', { name: 'Prompt 1' });
    await waitFor(() => expect(isInside(prompt, flow)).toBe(true));
  },
};

export const NewPipelineResetsView: Story = {
  render: () => <ReplaceDocumentPreview />,
  play: async ({ canvas, userEvent }) => {
    const flow = canvas.getByRole('application');
    await expect(await canvas.findByRole('group', { name: 'Prompt 1' })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'New pipeline' }));
    await waitFor(() =>
      expect(canvas.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Add an Input' }));

    // An empty document opens at the origin at full size, and the first node does not zoom in.
    const input = await canvas.findByRole('group', { name: 'Input 1' });
    await waitFor(async () => {
      await expect(input.getBoundingClientRect().width).toBeCloseTo(240, 0);
      await expect(input.getBoundingClientRect().left).toBeCloseTo(
        flow.getBoundingClientRect().left,
        0,
      );
      await expect(input.getBoundingClientRect().top).toBeCloseTo(
        flow.getBoundingClientRect().top,
        0,
      );
    });
  },
};

/** The accessible description of the node `name` on the canvas. */
async function descriptionOf(canvas: HTMLElement, name: string): Promise<string> {
  const node = await within(canvas).findByRole('group', { name });
  const id = node.getAttribute('aria-describedby') ?? '';
  return document.getElementById(id)?.textContent ?? '';
}

/**
 * A run in progress: the first nodes are done, the model streams its answer into its card (the
 * last lines, scrollable), and the Output waits in the queue. The edge into the model moves; the
 * edges that carried data are thicker.
 */
export const RunInProgress: Story = {
  args: {
    pipeline: template('ask-a-question'),
    run: [
      ...queued(template('ask-a-question')),
      ...done('question', { value: 'Why is the sky blue?' }),
      ...done('prompt', { prompt: 'Answer the question: Why is the sky blue?' }),
      ...streams('model', ANSWER),
    ],
  },
  play: async ({ canvasElement }) => {
    const model = await within(canvasElement).findByRole('group', { name: 'Model' });
    await expect(within(model).getByText('Running')).toBeVisible();
    const preview = within(model).getByRole('textbox', { name: 'Model response' });
    await expect(preview).toBeVisible();
    // The text overflows at the top: its last lines are the ones in view.
    const text = preview.getBoundingClientRect();
    const shown = preview.firstElementChild?.getBoundingClientRect();
    await expect(shown?.top).toBeLessThan(text.top);
    await expect(shown?.bottom).toBeLessThanOrEqual(text.bottom);
    await expect(await descriptionOf(canvasElement, 'Model')).toMatch(/Run status: running\./);
    await expect(await descriptionOf(canvasElement, 'Answer')).toMatch(/Run status: queued\./);
  },
};

/** A finished run that took one branch of a Condition: the Output of the other one is skipped. */
export const RunWithSkippedBranch: Story = {
  args: {
    pipeline: template('route-by-sentiment'),
    run: [
      ...queued(template('route-by-sentiment')),
      ...done('review', { value: 'The headphones arrived a day early, and they sound great.' }),
      ...done('prompt', { prompt: 'Is this review positive or negative?' }),
      ...done('classifier', { response: 'positive' }),
      ...done('is-positive', { true: 'positive' }),
      {
        type: 'node-status',
        nodeId: 'negative',
        status: 'skipped',
        skipReason: 'branch-not-taken',
      },
      ...done('positive', { value: 'positive' }),
      { type: 'run-finished', status: 'done' },
    ],
  },
  play: async ({ canvasElement }) => {
    const negative = await within(canvasElement).findByRole('group', { name: 'Negative' });
    await expect(within(negative).getByText('Skipped')).toBeVisible();
    await expect(await descriptionOf(canvasElement, 'Negative')).toMatch(
      /Run status: skipped, its branch was not taken\./,
    );
    const positive = within(canvasElement).getByRole('group', { name: 'Positive' });
    await expect(
      within(positive).getByRole('textbox', { name: 'Positive result' }),
    ).toHaveTextContent('positive');
  },
};

/** A run in which a node failed: the card says why, and the nodes below it are skipped. */
export const RunFailed: Story = {
  args: {
    pipeline: template('extract-a-json-field'),
    run: [
      ...queued(template('extract-a-json-field')),
      ...done('text', { value: 'Hi, I’m Ada Lovelace. Write to me at ada@example.com.' }),
      ...done('prompt', { prompt: 'Find the name and email of the person in this text.' }),
      ...done('extractor', { response: 'Ada Lovelace, ada@example.com' }),
      { type: 'node-status', nodeId: 'parse', status: 'running' },
      {
        type: 'node-status',
        nodeId: 'parse',
        status: 'error',
        error: { code: 'invalid-json', message: 'Input "value" is not valid JSON' },
      },
      {
        type: 'node-status',
        nodeId: 'get-email',
        status: 'skipped',
        skipReason: 'upstream-failed',
      },
      { type: 'node-status', nodeId: 'email', status: 'skipped', skipReason: 'upstream-failed' },
      { type: 'run-finished', status: 'error' },
    ],
  },
  play: async ({ canvasElement }) => {
    const parse = await within(canvasElement).findByRole('group', { name: 'Parse JSON' });
    await expect(within(parse).getByText('Failed')).toBeVisible();
    await expect(within(parse).getByText('Input "value" is not valid JSON')).toBeVisible();
    await expect(await descriptionOf(canvasElement, 'Email')).toMatch(
      /Run status: skipped, a node it depends on failed\./,
    );
  },
};

/** A run stopped while the model was answering: what it had streamed stays on its card. */
export const RunStopped: Story = {
  args: {
    pipeline: template('ask-a-question'),
    run: [
      ...queued(template('ask-a-question')),
      ...done('question', { value: 'Why is the sky blue?' }),
      ...done('prompt', { prompt: 'Answer the question: Why is the sky blue?' }),
      ...streams('model', 'The sky looks blue because air'),
      { type: 'node-status', nodeId: 'model', status: 'cancelled' },
      { type: 'node-status', nodeId: 'answer', status: 'cancelled' },
      { type: 'run-finished', status: 'cancelled' },
    ],
  },
  play: async ({ canvasElement }) => {
    const model = await within(canvasElement).findByRole('group', { name: 'Model' });
    await expect(within(model).getByText('Cancelled')).toBeVisible();
    await expect(within(model).getByRole('textbox', { name: 'Model response' })).toHaveTextContent(
      'The sky looks blue because air',
    );
  },
};

/**
 * Step by step, paused before the model: its card is highlighted and says Next, in words as well
 * as in colour, until the user lets it run.
 */
export const PausedBeforeNode: Story = {
  args: {
    pipeline: template('ask-a-question'),
    run: [
      ...queued(template('ask-a-question')),
      ...done('question', { value: 'Why is the sky blue?' }),
      ...done('prompt', { prompt: 'Answer the question: Why is the sky blue?' }),
    ],
    pausedBefore: 'model',
  },
  play: async ({ canvasElement }) => {
    const model = await within(canvasElement).findByRole('group', { name: 'Model' });
    await expect(within(model).getByText('Next')).toBeVisible();
    await expect(await descriptionOf(canvasElement, 'Model')).toMatch(
      /Run status: next\. The run is paused before this node\./,
    );
    const prompt = within(canvasElement).getByRole('group', { name: 'Answer prompt' });
    await expect(within(prompt).getByText('Done')).toBeVisible();
    await expect(within(prompt).queryByText('Next')).not.toBeInTheDocument();
  },
};

/**
 * Zoomed in on the middle of the pipeline: the view moves to each node the run pauses before that
 * is out of view, keeping the zoom.
 */
export const RevealPausedNode: Story = {
  render: () => <PausedNodeRevealPreview />,
  play: async ({ canvas, userEvent }) => {
    const flow = canvas.getByRole('application');
    const answer = await canvas.findByRole('group', { name: 'Answer' });
    const question = canvas.getByRole('group', { name: 'Question' });
    await userEvent.click(canvas.getByRole('button', { name: 'Zoom in on the middle' }));
    await waitFor(() => expect(isInside(answer, flow)).toBe(false));
    await expect(isInside(question, flow)).toBe(false);
    const width = answer.getBoundingClientRect().width;

    await userEvent.click(canvas.getByRole('button', { name: 'Pause before Answer' }));

    await waitFor(() => expect(isInside(answer, flow)).toBe(true));
    await expect(within(answer).getByText('Next')).toBeVisible();
    await expect(answer.getBoundingClientRect().width).toBeCloseTo(width, 0);

    await userEvent.click(canvas.getByRole('button', { name: 'Pause before Question' }));

    await waitFor(() => expect(isInside(question, flow)).toBe(true));
  },
};
