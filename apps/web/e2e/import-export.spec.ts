import type { FileChooser, Page } from '@playwright/test';

import { expect, test } from './fixtures';

/** Locators of the editor that both journeys use. */
function editor(page: Page) {
  const canvas = page.getByRole('main', { name: 'Pipeline canvas' });
  const fileToolbar = page.getByRole('toolbar', { name: 'File' });
  // Nodes and edges are both groups. Names are exact: an edge is named after its nodes.
  const node = (name: string) => canvas.getByRole('group', { name, exact: true });
  return {
    palette: page.getByRole('complementary', { name: 'Node palette' }),
    canvas,
    node,
    port: (nodeName: string, portName: string) =>
      node(nodeName).getByRole('button', { name: portName }),
    notifications: page.getByRole('region', { name: 'Notifications (F8)' }),
    /** Picks `files` in the file chooser that the Import button opens. */
    importFile: async (files: Parameters<FileChooser['setFiles']>[0]) => {
      const chooser = page.waitForEvent('filechooser');
      await fileToolbar.getByRole('button', { name: 'Import pipeline' }).click();
      await (await chooser).setFiles(files);
    },
    exportButton: fileToolbar.getByRole('button', { name: 'Export pipeline' }),
  };
}

test.describe('import and export', () => {
  test('exports a pipeline to a file and imports it back', async ({
    page,
    expectNoA11yViolations,
  }, testInfo) => {
    await page.goto('/');
    const { palette, canvas, node, port, notifications, importFile, exportButton } = editor(page);

    // A small pipeline: Input → Prompt.
    await palette.getByRole('button', { name: 'Add Input' }).press('Enter');
    await palette.getByRole('button', { name: 'Add Prompt' }).press('Enter');
    await port('Input 1', 'Output value (text)').click();
    await port('Prompt 1', 'Input question (text)').click();
    const edge = node('Input 1 value to Prompt 1 question');
    await expect(edge).toBeAttached();

    // Export downloads it as a file named after the pipeline.
    const download = page.waitForEvent('download');
    await exportButton.click();
    const exported = await download;
    expect(exported.suggestedFilename()).toBe('Untitled pipeline.pipeline.json');
    const savedFile = testInfo.outputPath(exported.suggestedFilename());
    await exported.saveAs(savedFile);

    // Delete everything.
    for (const name of ['Input 1', 'Prompt 1']) {
      await node(name).getByText(name, { exact: true }).click();
      await page.keyboard.press('Delete');
      await expect(node(name)).toHaveCount(0);
    }
    await expect(
      canvas.getByText('Drag a node from the palette, or click one, to start your pipeline.'),
    ).toBeVisible();

    // Importing the file brings the nodes and their edge back, in view.
    await importFile(savedFile);
    await expect(notifications.getByRole('listitem')).toContainText('Imported “Untitled pipeline”');
    await expect(node('Input 1')).toBeInViewport();
    await expect(node('Prompt 1')).toBeInViewport();
    await expect(edge).toBeAttached();
    await expectNoA11yViolations();
  });

  test('explains why a file cannot be imported and keeps the pipeline', async ({ page }) => {
    await page.goto('/');
    const { palette, node, notifications, importFile } = editor(page);
    await palette.getByRole('button', { name: 'Add Input' }).press('Enter');
    await expect(node('Input 1')).toBeVisible();

    await importFile({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Ask about the weather, then summarise.'),
    });

    const toast = notifications.getByRole('listitem');
    await expect(toast).toContainText('Couldn’t import “notes.txt”');
    await expect(toast).toContainText('The file is not valid JSON.');
    await expect(node('Input 1')).toBeVisible();
  });
});
