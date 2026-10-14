import { editor } from './editor';
import { expect, test } from './fixtures';

test.describe('smoke', () => {
  test('opens the editor with an empty canvas', async ({ page, expectNoA11yViolations }) => {
    await page.goto('/');
    const { heading, canvas } = editor(page);

    await expect(page).toHaveTitle('Pipeline Builder');
    await expect(heading).toHaveText('Untitled pipeline');
    await expect(heading).toBeVisible();
    await expect(canvas).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom In' })).toBeVisible();

    await expectNoA11yViolations();
  });

  test('keeps the chosen dark theme after a reload', async ({ page, expectNoA11yViolations }) => {
    await page.goto('/');
    const html = page.locator('html');

    await page.getByRole('group', { name: 'Colour theme' }).getByText('Dark').click();
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // theme-init.js applies the stored preference before React mounts.
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();

    await expectNoA11yViolations();
  });

  test('shows a placeholder on narrow screens', async ({ page, expectNoA11yViolations }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'Pipeline Builder needs a larger screen' }),
    ).toBeVisible();
    await expect(editor(page).canvas).toBeHidden();

    await expectNoA11yViolations();
  });
});
