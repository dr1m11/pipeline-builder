import { expect, test } from './fixtures';

test.describe('keyboard shortcuts help', () => {
  test('opens with ? and closes with Escape', async ({ page, expectNoA11yViolations }) => {
    await page.goto('/');
    const helpButton = page.getByRole('button', { name: 'Keyboard shortcuts' });
    await expect(helpButton).toBeVisible();

    await page.keyboard.press('?');
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('table', { name: 'Edit' })).toBeVisible();
    await expect(
      dialog
        .getByRole('table', { name: 'Canvas' })
        .getByRole('row', { name: 'Delete the selection Delete or Backspace' }),
    ).toBeVisible();
    await expectNoA11yViolations();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(helpButton).toBeFocused();
  });
});
