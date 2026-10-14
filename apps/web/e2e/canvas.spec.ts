import { editor } from './editor';
import { expect, test } from './fixtures';

test.describe('canvas', () => {
  test('builds a pipeline from scratch', async ({ page, expectNoA11yViolations }) => {
    await page.goto('/');
    const { palette, paletteItem, canvas, emptyHint, node, edge, port, connect, select } =
      editor(page);

    await expect(emptyHint).toBeVisible();

    // Drag a node from the palette; add two more from the keyboard.
    await paletteItem('Input').dragTo(canvas, { targetPosition: { x: 200, y: 200 } });
    await expect(node('Input 1')).toBeVisible();
    await paletteItem('Prompt').press('Enter');
    await paletteItem('LLM Call').press('Enter');
    await expect(palette.getByRole('status')).toHaveText('Added LLM Call 1');

    // Connect compatible ports: a click (or Enter) on an output, then on an input.
    await connect(['Input 1', 'Output value (text)'], ['Prompt 1', 'Input question (text)']);
    await port('Prompt 1', 'Output prompt (text)').press('Enter');
    await port('LLM Call 1', 'Input prompt (text)').press('Enter');
    await expect(edge('Input 1 value to Prompt 1 question')).toBeVisible();
    await expect(edge('Prompt 1 prompt to LLM Call 1 prompt')).toBeVisible();
    await expectNoA11yViolations();

    // A Transform's JSON result cannot feed the LLM Call's text input: the port is disabled while
    // the connection is made, and pressing Enter on it anyway connects nothing.
    await paletteItem('Transform').click();
    await port('Transform 1', 'Output result (json)').click();
    const systemPrompt = port('LLM Call 1', 'Input system prompt (text)');
    await expect(systemPrompt).toHaveAttribute('aria-disabled', 'true');
    await systemPrompt.press('Enter');
    await expect(systemPrompt).not.toHaveAttribute('aria-disabled');
    await expect(edge('Transform 1 result to LLM Call 1 system prompt')).toHaveCount(0);

    // Deleting a node deletes its edges.
    await select('Prompt 1');
    await page.keyboard.press('Delete');
    await expect(node('Prompt 1')).toHaveCount(0);
    await expect(edge('Input 1 value to Prompt 1 question')).toHaveCount(0);
    await expect(edge('Prompt 1 prompt to LLM Call 1 prompt')).toHaveCount(0);
    await expect(node('Input 1')).toBeVisible();
    await expect(node('LLM Call 1')).toBeVisible();

    await expectNoA11yViolations();
  });
});
