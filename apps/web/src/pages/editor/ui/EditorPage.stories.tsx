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
