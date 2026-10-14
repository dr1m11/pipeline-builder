import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

import { EditorPage } from './EditorPage';

interface Point {
  x: number;
  y: number;
}

function centerOf(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Drags `source` over `target` and drops it at `at`, as the browser's drag and drop does. */
function dragAndDrop(source: Element, target: Element, at: Point): void {
  const dataTransfer = new DataTransfer();
  const init = { bubbles: true, cancelable: true, dataTransfer, clientX: at.x, clientY: at.y };
  source.dispatchEvent(new DragEvent('dragstart', init));
  target.dispatchEvent(new DragEvent('dragenter', init));
  target.dispatchEvent(new DragEvent('dragover', init));
  target.dispatchEvent(new DragEvent('drop', init));
  source.dispatchEvent(new DragEvent('dragend', init));
}

// React Flow drags nodes with d3-drag, which needs `event.view`; user-event leaves it unset, so
// the node is dragged with mouse events dispatched the way a browser does.
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

/** Picks a node up, moves it by `by` in several steps and drops it. */
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

const meta = {
  title: 'pages/Editor',
  component: EditorPage,
  parameters: { layout: 'fullscreen' },
  // The page fills its parent, and the story root has no height of its own.
  decorators: [
    (Story) => (
      <div className="h-[40rem] w-[72rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EditorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText('Drag a node from the palette, or click one, to start your pipeline.'),
    ).toBeVisible();
  },
};

export const DropNodeOnCanvas: Story = {
  play: async ({ canvas, canvasElement }) => {
    const canvasRegion = canvas.getByRole('main', { name: 'Pipeline canvas' });
    // The pane has no role or name to query it by.
    const pane = canvasElement.querySelector('.react-flow__pane');
    if (pane === null) throw new Error('React Flow pane not found');
    // Off the middle, where a stray fit of the view would put the node too.
    const region = canvasRegion.getBoundingClientRect();
    const dropPoint = { x: region.left + region.width / 4, y: region.top + region.height / 4 };

    dragAndDrop(canvas.getByRole('button', { name: 'Add Input' }), pane, dropPoint);

    // The card is centred on the drop point, at the zoom the canvas had.
    const node = await canvas.findByRole('group', { name: 'Input 1' });
    await expect(node).toBeVisible();
    const card = centerOf(node);
    await expect(Math.abs(card.x - dropPoint.x)).toBeLessThan(40);
    await expect(Math.abs(card.y - dropPoint.y)).toBeLessThan(40);
    await expect(node.getBoundingClientRect().width).toBeCloseTo(240, 0);
  },
};

export const RenameInInspector: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add Prompt' }));
    const inspector = canvas.getByRole('complementary', { name: 'Inspector' });
    const name = within(inspector).getByRole('textbox', { name: 'Name' });

    await userEvent.click(name);
    await userEvent.keyboard('{Control>}a{/Control}Ask the model');

    // The canvas follows the form as it is typed.
    await expect(await canvas.findByRole('group', { name: 'Ask the model' })).toBeVisible();
  },
};

export const JumpToProblem: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add Prompt' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add LLM Call' }));
    const problems = canvas.getByRole('list', { name: 'Problems of the pipeline' });

    await userEvent.click(
      within(problems).getByRole('button', {
        name: 'Error: Prompt 1, Input "question" is not connected',
      }),
    );

    // The node is selected, brought into view and focused for the keyboard.
    const node = canvas.getByRole('group', { name: 'Prompt 1' });
    await waitFor(() => expect(node).toHaveFocus());
    await expect(node).toBeVisible();
    const inspector = canvas.getByRole('complementary', { name: 'Inspector' });
    await expect(
      within(inspector).getByRole('heading', { level: 3, name: 'Prompt 1' }),
    ).toBeVisible();
  },
};

export const AddNodeWithClick: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add LLM Call' }));

    await expect(await canvas.findByRole('group', { name: 'LLM Call 1' })).toBeVisible();
    await expect(canvas.getByRole('status')).toHaveTextContent('Added LLM Call 1');
  },
};

export const UndoDrag: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add Input' }));
    const node = await canvas.findByRole('group', { name: 'Input 1' });
    await waitFor(() => expect(node).toBeVisible());
    const before = node.getBoundingClientRect();

    dragNode(node, { x: 80, y: 120 });

    // The whole drag is one step, and undoing it puts the node back where it was.
    const toolbar = canvas.getByRole('toolbar', { name: 'Edit' });
    await userEvent.click(
      await within(toolbar).findByRole('button', { name: 'Undo Move Input 1' }),
    );
    await waitFor(async () => {
      const after = node.getBoundingClientRect();
      await expect(after.left).toBeCloseTo(before.left, 0);
      await expect(after.top).toBeCloseTo(before.top, 0);
    });
    await expect(within(toolbar).getByRole('button', { name: 'Undo Add Input' })).toBeEnabled();
    await expect(within(toolbar).getByRole('button', { name: 'Redo Move Input 1' })).toBeEnabled();
  },
};
