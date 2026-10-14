import { expect, test } from './fixtures';

test.describe('clipboard', () => {
  test('copies, pastes and duplicates nodes with the keyboard', async ({ page }) => {
    await page.goto('/');
    const palette = page.getByRole('complementary', { name: 'Node palette' });
    const canvas = page.getByRole('main', { name: 'Pipeline canvas' });
    const toolbar = page.getByRole('toolbar', { name: 'Edit' });
    // Nodes and edges are both groups, named exactly ("Input 1 value to Prompt 1 question"). An
    // edge between ports level with each other is a flat line, which Playwright never sees as
    // visible, so edges are counted instead.
    const node = (name: string) => canvas.getByRole('group', { name, exact: true });
    const edge = node;
    const port = (nodeName: string, portName: string) =>
      node(nodeName).getByRole('button', { name: portName });

    await palette.getByRole('button', { name: 'Add Input' }).click();
    await palette.getByRole('button', { name: 'Add Prompt' }).click();
    await port('Input 1', 'Output value (text)').click();
    await port('Prompt 1', 'Input question (text)').click();
    await expect(edge('Input 1 value to Prompt 1 question')).toHaveCount(1);

    // Copy both nodes with the edge between them and paste them back: the browser's own clipboard
    // events, with nothing asked of the user. The port just clicked still has the focus.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+C');
    await page.keyboard.press('ControlOrMeta+V');
    await expect(node('Input 2')).toBeVisible();
    await expect(node('Prompt 2')).toBeVisible();
    await expect(edge('Input 2 value to Prompt 2 question')).toHaveCount(1);
    await expect(canvas.getByRole('group', { name: /^(Input|Prompt) \d$/ })).toHaveCount(4);
    await expect(toolbar.getByRole('button', { name: 'Undo Paste 2 nodes' })).toBeEnabled();

    // The pasted nodes are the selection, so Ctrl+D duplicates them.
    await page.keyboard.press('ControlOrMeta+D');
    await expect(node('Input 3')).toBeVisible();
    await expect(edge('Input 3 value to Prompt 3 question')).toHaveCount(1);

    // Each change is one undo step.
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(node('Input 3')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(node('Input 2')).toHaveCount(0);
    await expect(node('Prompt 2')).toHaveCount(0);
    await expect(node('Input 1')).toBeVisible();
    await expect(edge('Input 1 value to Prompt 1 question')).toHaveCount(1);
  });

  test('cuts a node clicked after selecting text elsewhere', async ({ page }) => {
    await page.goto('/');
    const palette = page.getByRole('complementary', { name: 'Node palette' });
    const canvas = page.getByRole('main', { name: 'Pipeline canvas' });
    const node = (name: string) => canvas.getByRole('group', { name, exact: true });

    await palette.getByRole('button', { name: 'Add LLM Call' }).click();
    await expect(node('LLM Call 1')).toBeVisible();
    // Text selected in the palette is left behind once the node is clicked, so Ctrl+X cuts the node.
    await palette.getByText('Drag a node onto the canvas').click({ clickCount: 3 });
    await node('LLM Call 1').getByText('LLM Call 1').click();

    await page.keyboard.press('ControlOrMeta+X');
    await expect(node('LLM Call 1')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+V');
    await expect(node('LLM Call 1')).toBeVisible();
  });
});
