import { editor } from './editor';
import { expect, test } from './fixtures';

test.describe('editing', () => {
  test('undoes and redoes edits, copies, pastes, duplicates and deletes nodes', async ({
    page,
    expectNoA11yViolations,
  }) => {
    await page.goto('/');
    const {
      canvas,
      templateButtons,
      node,
      edge,
      inspector,
      undoButton,
      redoButton,
      shortcutsButton,
      shortcutsHelp,
      select,
    } = editor(page);

    await templateButtons.getByRole('button', { name: 'Ask a question' }).click();
    await expect(node('Question')).toBeVisible();
    await expect(undoButton).toHaveAccessibleName('Undo Load template “Ask a question”');
    await expect(redoButton).toBeDisabled();

    // Typing in a field is one undo step, however many keys it takes. Each button names its step.
    await select('Question');
    const value = inspector.getByRole('textbox', { name: 'Value' });
    const typed = 'Why is the sky blue? Answer in one sentence.';
    await expect(value).toHaveValue('Why is the sky blue?');
    await value.press('End');
    await value.pressSequentially(' Answer in one sentence.');
    await expect(undoButton).toHaveAccessibleName('Undo Edit Value of Question');
    await undoButton.click();
    await expect(value).toHaveValue('Why is the sky blue?');
    await expect(undoButton).toHaveAccessibleName('Undo Load template “Ask a question”');
    await expect(redoButton).toHaveAccessibleName('Redo Edit Value of Question');
    await redoButton.click();
    await expect(value).toHaveValue(typed);
    await expect(redoButton).toBeDisabled();
    // The same from the keyboard, outside the text field, which keeps Ctrl+Z for its own text.
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(value).toHaveValue('Why is the sky blue?');
    await page.keyboard.press('ControlOrMeta+Shift+Z');
    await expect(value).toHaveValue(typed);

    // Copies of two connected nodes get labels of their own and the edge between them. Edges
    // between ports level with each other are flat lines, which Playwright never sees as visible,
    // so edges are counted instead.
    await select('Question');
    await select('Answer prompt', { add: true });
    await expect(inspector.getByText('2 nodes are selected.')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+C');
    await page.keyboard.press('ControlOrMeta+V');
    await expect(node('Question (copy)')).toBeVisible();
    await expect(node('Answer prompt (copy)')).toBeVisible();
    await expect(edge('Question (copy) value to Answer prompt (copy) question')).toHaveCount(1);
    await expect(edge('Question value to Answer prompt question')).toHaveCount(1);
    await expect(undoButton).toHaveAccessibleName('Undo Paste 2 nodes');
    // The copies are the selection, so dragging one moves both, in one step, off the originals.
    await node('Question (copy)')
      .getByText('Question (copy)', { exact: true })
      .dragTo(canvas, { targetPosition: { x: 200, y: 640 }, steps: 10 });
    await expect(undoButton).toHaveAccessibleName('Undo Move 2 nodes');

    // Ctrl+D duplicates the selection the same way, also in one step.
    const copies = canvas.getByRole('group', { name: / \(copy\)$/ });
    await select('Model');
    await select('Answer', { add: true });
    await page.keyboard.press('ControlOrMeta+D');
    await expect(node('Model (copy)')).toBeVisible();
    await expect(node('Answer (copy)')).toBeVisible();
    await expect(edge('Model (copy) response to Answer (copy) value')).toHaveCount(1);
    await expect(copies).toHaveCount(4);
    await expect(undoButton).toHaveAccessibleName('Undo Duplicate 2 nodes');
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(copies).toHaveCount(2);
    await expect(edge('Model (copy) response to Answer (copy) value')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Shift+Z');
    await expect(copies).toHaveCount(4);
    await expect(edge('Model (copy) response to Answer (copy) value')).toHaveCount(1);

    // Ctrl+A selects every node, and Escape clears the selection.
    await page.keyboard.press('ControlOrMeta+A');
    await expect(inspector.getByText('8 nodes are selected.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(inspector.getByText('Select a node to edit its properties.')).toBeVisible();

    // A deleted node takes its edges along, and one undo brings them all back.
    await select('Model');
    await page.keyboard.press('Delete');
    await expect(node('Model')).toHaveCount(0);
    await expect(edge('Answer prompt prompt to Model prompt')).toHaveCount(0);
    await expect(edge('Model response to Answer value')).toHaveCount(0);
    await expect(undoButton).toHaveAccessibleName('Undo Delete Model');
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(node('Model')).toBeVisible();
    await expect(edge('Answer prompt prompt to Model prompt')).toHaveCount(1);
    await expect(edge('Model response to Answer value')).toHaveCount(1);
    await expect(redoButton).toHaveAccessibleName('Redo Delete Model');

    // ? opens the keyboard shortcuts help. The deleted node took the focus with it, so closing the
    // help gives focus to its button.
    await page.keyboard.press('?');
    await expect(shortcutsHelp).toBeVisible();
    await expect(shortcutsHelp.getByRole('table', { name: 'Edit' })).toBeVisible();
    await expect(
      shortcutsHelp
        .getByRole('table', { name: 'Canvas' })
        .getByRole('row', { name: 'Delete the selection Delete or Backspace' }),
    ).toBeVisible();
    await expectNoA11yViolations();
    await page.keyboard.press('Escape');
    await expect(shortcutsHelp).toBeHidden();
    await expect(shortcutsButton).toBeFocused();

    await expectNoA11yViolations();
  });

  test('cuts a node clicked after selecting text elsewhere', async ({ page }) => {
    await page.goto('/');
    const { palette, paletteItem, node, select } = editor(page);

    await paletteItem('LLM Call').click();
    await expect(node('LLM Call 1')).toBeVisible();
    // Text selected in the palette is left behind once the node is clicked, so Ctrl+X cuts the node.
    await palette.getByText('Drag a node onto the canvas').click({ clickCount: 3 });
    await select('LLM Call 1');

    await page.keyboard.press('ControlOrMeta+X');
    await expect(node('LLM Call 1')).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+V');
    await expect(node('LLM Call 1')).toBeVisible();
  });
});
