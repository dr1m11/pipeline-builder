import { expect, test } from './fixtures';

test.describe('templates', () => {
  test('starts from a template, replaces it from the New menu and undoes that', async ({
    page,
    expectNoA11yViolations,
  }) => {
    await page.goto('/');
    const canvas = page.getByRole('main', { name: 'Pipeline canvas' });
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    const heading = page.getByRole('heading', { level: 1 });
    const fileToolbar = page.getByRole('toolbar', { name: 'File' });
    const notifications = page.getByRole('region', { name: 'Notifications (F8)' });
    // Nodes and edges are both groups. Names are exact: an edge is named after its nodes.
    const node = (name: string) => canvas.getByRole('group', { name, exact: true });
    const emptyHint = canvas.getByText(
      'Drag a node from the palette, or click one, to start your pipeline.',
    );
    const chooseFromNewMenu = async (item: string) => {
      await fileToolbar.getByRole('button', { name: 'New' }).click();
      await page.getByRole('menuitem', { name: item }).click();
    };
    // The whole card is on screen, up to subpixel rounding of the fitted zoom.
    const expectWholeCard = (name: string) => expect(node(name)).toBeInViewport({ ratio: 0.99 });

    // The empty canvas offers the templates.
    const templates = canvas.getByRole('group', { name: 'Start from a template:' });
    await expect(templates).toBeVisible();
    await expectNoA11yViolations();
    await templates.getByRole('button', { name: 'Ask a question' }).click();

    // A ready pipeline, fitted into view and without problems.
    await expect(heading).toHaveText('Ask a question');
    for (const name of ['Question', 'Answer prompt', 'Model', 'Answer']) {
      await expectWholeCard(name);
    }
    // The button left with the hint, so focus moves to the canvas instead of the page.
    await expect(node('Question')).toBeFocused();
    await expect(node('Question value to Answer prompt question')).toBeAttached();
    await expect(node('Model response to Answer value')).toBeAttached();
    await expect(inspector.getByRole('button', { name: 'Problems: none' })).toBeVisible();
    await expect(emptyHint).toHaveCount(0);

    // Another template replaces it, and the toast tells what happened.
    await chooseFromNewMenu('Route by sentiment');
    await expect(heading).toHaveText('Route by sentiment');
    for (const name of ['Review', 'Is positive?', 'Positive', 'Negative']) {
      await expectWholeCard(name);
    }
    await expect(node('Question')).toHaveCount(0);
    await expect(notifications.getByRole('listitem')).toContainText('Loaded “Route by sentiment”');
    await expect(inspector.getByRole('button', { name: 'Problems: none' })).toBeVisible();
    await expectNoA11yViolations();

    // One undo brings the previous pipeline back.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(heading).toHaveText('Ask a question');
    await expect(node('Question')).toBeInViewport();
    await expect(node('Is positive?')).toHaveCount(0);

    // A blank pipeline empties the canvas.
    await chooseFromNewMenu('Blank pipeline');
    await expect(heading).toHaveText('Untitled pipeline');
    await expect(node('Question')).toHaveCount(0);
    await expect(emptyHint).toBeVisible();
    await expect(templates).toBeVisible();
    await expectNoA11yViolations();
  });
});
