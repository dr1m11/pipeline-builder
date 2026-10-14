import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { editor } from './editor';
import { expect, test } from './fixtures';

// A pipeline exported by the released version 1 app (schema version 1, before LLM Call nodes had a
// provider): Input → Prompt → LLM Call → Output, with the LLM Call temperature at 0.3.
const PIPELINE_V1 = fileURLToPath(new URL('./fixtures/pipeline-v1.json', import.meta.url));
// The "Route by sentiment" template exported by the released version 2 app (schema version 2, when
// the mock provider was the only one), with the LLM Call at 16 max tokens.
const PIPELINE_V2 = fileURLToPath(new URL('./fixtures/pipeline-v2.json', import.meta.url));

test.describe('pipeline files', () => {
  test('exports, imports and migrates pipeline files and autosaves the work', async ({
    page,
    expectNoA11yViolations,
  }, testInfo) => {
    await page.goto('/');
    const {
      heading,
      templateButtons,
      emptyHint,
      node,
      edge,
      inspector,
      undoButton,
      toasts,
      toast,
      select,
      chooseFromNewMenu,
      importFile,
      exportFile,
    } = editor(page);

    // Export downloads the pipeline as a file named after it, in the current schema version.
    await templateButtons.getByRole('button', { name: 'Extract a JSON field' }).click();
    await expect(heading).toHaveText('Extract a JSON field');
    const download = await exportFile();
    expect(download.suggestedFilename()).toBe('Extract a JSON field.pipeline.json');
    const savedFile = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(savedFile);
    const saved: unknown = JSON.parse(await readFile(savedFile, 'utf8'));
    expect(saved).toMatchObject({
      format: 'pipeline-builder',
      schemaVersion: 3,
      name: 'Extract a JSON field',
    });

    // Importing the file into a blank pipeline brings its nodes and edges back, in view.
    await chooseFromNewMenu('Blank pipeline');
    await expect(heading).toHaveText('Untitled pipeline');
    await expect(emptyHint).toBeVisible();
    await importFile(savedFile);
    await expect(toast('Imported “Extract a JSON field”')).toBeVisible();
    await expect(heading).toHaveText('Extract a JSON field');
    for (const name of [
      'Text',
      'Extraction prompt',
      'Extractor',
      'Parse JSON',
      'Get email',
      'Email',
    ]) {
      await expect(node(name)).toBeInViewport();
    }
    await expect(edge('Extractor response to Parse JSON value')).toBeAttached();
    await expect(edge('Get email result to Email value')).toBeAttached();
    await expectNoA11yViolations();

    // A file that is not a pipeline is turned down with the reason, and the pipeline stays.
    await importFile({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Ask about the weather, then summarise.'),
    });
    await expect(toast('Couldn’t import “notes.txt”')).toContainText('The file is not valid JSON.');
    await expect(heading).toHaveText('Extract a JSON field');
    await expect(node('Text')).toBeVisible();

    // A file saved by version 2 of the app opens as it was: version 3 only adds providers.
    await importFile(PIPELINE_V2);
    await expect(toast('Imported “Route by sentiment”')).toContainText(
      'Updated from schema version 2.',
    );
    await expect(heading).toHaveText('Route by sentiment');
    for (const name of ['Review', 'Sentiment prompt', 'Classifier', 'Is positive?']) {
      await expect(node(name)).toBeInViewport();
    }
    await expect(edge('Is positive? true to Positive value')).toBeAttached();
    await expect(edge('Is positive? false to Negative value')).toBeAttached();
    await select('Classifier');
    await expect(inspector.getByRole('combobox', { name: 'Provider' })).toHaveValue('mock');
    await expect(inspector.getByRole('textbox', { name: 'Model' })).toHaveValue('mock');
    await expect(inspector.getByRole('spinbutton', { name: 'Max tokens' })).toHaveValue('16');

    // A file saved by version 1 of the app is updated on import: its LLM Call gets the provider
    // that version 1 always used and keeps its settings.
    await importFile(PIPELINE_V1);
    await expect(toast('Imported “Untitled pipeline”')).toContainText(
      'Updated from schema version 1.',
    );
    for (const name of ['Input 1', 'Prompt 1', 'LLM Call 1', 'Output 1']) {
      await expect(node(name)).toBeInViewport();
    }
    await expect(node('Text')).toHaveCount(0);
    await expect(edge('Input 1 value to Prompt 1 question')).toBeAttached();
    await expect(edge('Prompt 1 prompt to LLM Call 1 prompt')).toBeAttached();
    await expect(edge('LLM Call 1 response to Output 1 value')).toBeAttached();
    await select('LLM Call 1');
    await expect(inspector.getByRole('heading', { name: 'LLM Call 1', level: 3 })).toBeVisible();
    const provider = inspector.getByRole('combobox', { name: 'Provider' });
    await expect(provider).toHaveValue('mock');
    await expect(
      provider.getByRole('option', { name: 'Mock (no API key)', selected: true }),
    ).toBeAttached();
    await expect(inspector.getByRole('spinbutton', { name: 'Temperature' })).toHaveValue('0.3');

    // The work is saved in the browser as it goes, and at once when the page is hidden: a reload
    // opens it again as it was, renamed node and all, with no notice.
    await inspector.getByRole('textbox', { name: 'Name' }).fill('Ask the model');
    await expect(node('Ask the model')).toBeVisible();
    await page.reload();
    await expect(heading).toHaveText('Untitled pipeline');
    for (const name of ['Input 1', 'Prompt 1', 'Ask the model', 'Output 1']) {
      await expect(node(name)).toBeVisible();
    }
    await expect(edge('Input 1 value to Prompt 1 question')).toBeAttached();
    await expect(edge('Prompt 1 prompt to Ask the model prompt')).toBeAttached();
    await expect(edge('Ask the model response to Output 1 value')).toBeAttached();
    await expect(emptyHint).toBeHidden();
    await expect(toasts).toHaveCount(0);
    // The restored pipeline is where editing starts, not a step to undo.
    await expect(undoButton).toBeDisabled();
    await select('Ask the model');
    await expect(inspector.getByRole('combobox', { name: 'Provider' })).toHaveValue('mock');
    await expect(inspector.getByRole('spinbutton', { name: 'Temperature' })).toHaveValue('0.3');
    await expectNoA11yViolations();
  });
});
