import { expect, test } from './fixtures';

test.describe('autosave', () => {
  test('keeps the pipeline after a reload', async ({ page, expectNoA11yViolations }) => {
    await page.goto('/');
    const palette = page.getByRole('complementary', { name: 'Node palette' });
    const canvas = page.getByRole('main', { name: 'Pipeline canvas' });
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    // Nodes and edges are both groups; an edge is named after its nodes.
    const node = (name: string) => canvas.getByRole('group', { name, exact: true });
    const edge = node;
    const port = (nodeName: string, portName: string) =>
      node(nodeName).getByRole('button', { name: portName });
    const hint = canvas.getByText(
      'Drag a node from the palette, or click one, to start your pipeline.',
    );

    await palette.getByRole('button', { name: 'Add Input' }).press('Enter');
    await palette.getByRole('button', { name: 'Add Prompt' }).press('Enter');
    await expect(palette.getByRole('status')).toHaveText('Added Prompt 1');
    await port('Input 1', 'Output value (text)').click();
    await port('Prompt 1', 'Input question (text)').click();
    await expect(edge('Input 1 value to Prompt 1 question')).toBeAttached();
    await node('Prompt 1').getByText('Prompt 1', { exact: true }).click();
    await inspector.getByRole('textbox', { name: 'Name' }).fill('Ask the model');
    await expect(node('Ask the model')).toBeVisible();

    // Reloading hides the page, which saves the pipeline at once.
    await page.reload();

    await expect(node('Input 1')).toBeVisible();
    await expect(node('Ask the model')).toBeVisible();
    await expect(edge('Input 1 value to Ask the model question')).toBeAttached();
    await expect(hint).toBeHidden();
    await expect(
      page.getByRole('region', { name: 'Notifications (F8)' }).getByRole('listitem'),
    ).toHaveCount(0);
    await expectNoA11yViolations();
  });
});
