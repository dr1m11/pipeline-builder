import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures';

// A pipeline exported by the released version 1 app (schema version 1, before LLM Call nodes had a
// provider): Input → Prompt → LLM Call → Output, with the LLM Call temperature at 0.3.
const PIPELINE_V1 = fileURLToPath(new URL('./fixtures/pipeline-v1.json', import.meta.url));

test.describe('schema migration', () => {
  test('imports a file saved by an older version of the app', async ({
    page,
    expectNoA11yViolations,
  }) => {
    await page.goto('/');
    const canvas = page.getByRole('main', { name: 'Pipeline canvas' });
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    // Nodes and edges are both groups. Names are exact: an edge is named after its nodes.
    const node = (name: string) => canvas.getByRole('group', { name, exact: true });

    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('toolbar', { name: 'File' })
      .getByRole('button', { name: 'Import pipeline' })
      .click();
    await (await chooser).setFiles(PIPELINE_V1);

    const toast = page.getByRole('region', { name: 'Notifications (F8)' }).getByRole('listitem');
    await expect(toast).toContainText('Imported “Untitled pipeline”');
    await expect(toast).toContainText('Updated from schema version 1.');
    for (const name of ['Input 1', 'Prompt 1', 'LLM Call 1', 'Output 1']) {
      await expect(node(name)).toBeInViewport();
    }
    await expect(node('Prompt 1 prompt to LLM Call 1 prompt')).toBeAttached();
    await expect(node('LLM Call 1 response to Output 1 value')).toBeAttached();

    // The LLM Call got the provider version 1 always used and kept its settings.
    await node('LLM Call 1').getByText('LLM Call 1', { exact: true }).click();
    await expect(inspector.getByRole('heading', { name: 'LLM Call 1', level: 3 })).toBeVisible();
    const provider = inspector.getByRole('combobox', { name: 'Provider' });
    await expect(provider).toHaveValue('mock');
    await expect(
      provider.getByRole('option', { name: 'Mock (no API key)', selected: true }),
    ).toBeAttached();
    await expect(inspector.getByRole('spinbutton', { name: 'Temperature' })).toHaveValue('0.3');
    await expectNoA11yViolations();
  });
});
