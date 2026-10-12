import { expect, test } from './fixtures';

test.describe('smoke', () => {
  test('opens the editor with an empty canvas', async ({ page, expectNoA11yViolations }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Pipeline Builder');
    await expect(page.getByRole('heading', { level: 1, name: 'Untitled pipeline' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Pipeline canvas' })).toBeVisible();
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
    await expect(page.getByRole('main', { name: 'Pipeline canvas' })).toBeHidden();

    await expectNoA11yViolations();
  });
});
