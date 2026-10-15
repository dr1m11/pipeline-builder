import { readFile } from 'node:fs/promises';

import type { Page, Request } from '@playwright/test';

import { editor } from './editor';
import { expect, test } from './fixtures';

const LLM_STREAM_PATH = '/api/llm/stream';

/** Whether `url` is the proxy's stream endpoint. */
function isLlmStream(url: string): boolean {
  return new URL(url).pathname === LLM_STREAM_PATH;
}

/** Collects every request the page sends to the stream endpoint, from now on. */
function recordLlmRequests(page: Page): readonly Request[] {
  const requests: Request[] = [];
  page.on('request', (request) => {
    if (isLlmStream(request.url())) requests.push(request);
  });
  return requests;
}

/** Names of the entries in the page's `localStorage` whose value contains `text`. */
async function localStorageEntriesWith(page: Page, text: string): Promise<string[]> {
  const { origins } = await page.context().storageState();
  return origins.flatMap(({ localStorage }) =>
    localStorage.filter(({ value }) => value.includes(text)).map(({ name }) => name),
  );
}

test.describe('running pipelines', () => {
  test('runs each template through the proxy, streaming the answers onto the canvas', async ({
    page,
    expectNoA11yViolations,
  }) => {
    await page.goto('/');
    const {
      heading,
      templateButtons,
      node,
      inspector,
      runButton,
      stopButton,
      runStatus,
      runPreview,
      runOutput,
      toasts,
      chooseFromNewMenu,
    } = editor(page);

    // "Ask a question": the Prompt fills in the question, and the mock provider streams the
    // answer from the Worker on the same origin, as the deployed app does.
    await templateButtons.getByRole('button', { name: 'Ask a question' }).click();
    await expect(heading).toHaveText('Ask a question');
    await expect(runButton).not.toHaveAttribute('aria-disabled');
    await expect(stopButton).toHaveAttribute('aria-disabled', 'true');
    const response = page.waitForResponse((each) => isLlmStream(each.url()));
    await runButton.click();

    await expect(runStatus).toHaveText('Run started');
    const stream = await response;
    expect(stream.status()).toBe(200);
    expect(stream.headers()['content-type']).toMatch(/^text\/event-stream\b/);
    expect(stream.request().postDataJSON()).toMatchObject({
      provider: 'mock',
      prompt: 'Answer the question: Why is the sky blue?',
    });
    // The mock needs no key, so none is sent.
    expect(await stream.request().headerValue('authorization')).toBeNull();

    // The answer shows on the Model as it streams in, while the run goes on: the Answer has
    // nothing yet, and Stop is there for the run.
    await expect(runPreview('Model', 'response')).toContainText('**Why is the sky blue?**');
    await expect(runStatus).toHaveText('Run started');
    await expect(node('Model')).toHaveAccessibleDescription(/Run status: running\./);
    await expect(node('Model').getByText('Running', { exact: true })).toBeVisible();
    await expect(runPreview('Answer', 'result')).toHaveCount(0);
    await expect(stopButton).not.toHaveAttribute('aria-disabled');
    await expect(runButton).toHaveAttribute('aria-disabled', 'true');
    await expect(runButton).toHaveAccessibleDescription('The pipeline is running');
    await expectNoA11yViolations();

    // Then the Answer shows the whole answer, and every node is done.
    await expect(runStatus).toHaveText('Run finished: 4 nodes done');
    const answer = runPreview('Answer', 'result');
    await expect(answer).toContainText('**Why is the sky blue?**');
    await expect(answer).toContainText('fills JSON objects with a name and an email.');
    for (const name of ['Question', 'Answer prompt', 'Model', 'Answer']) {
      await expect(node(name)).toHaveAccessibleDescription(/Run status: done\./);
    }
    await expect(node('Answer').getByText('Done', { exact: true })).toBeVisible();
    await expect(stopButton).toHaveAttribute('aria-disabled', 'true');
    await expect(runButton).not.toHaveAttribute('aria-disabled');
    await expect(toasts).toHaveCount(0);

    // "Route by sentiment", run from the keyboard: the review is positive, so the Positive Output
    // gets the answer, and the Negative one, on the branch not taken, is skipped.
    await chooseFromNewMenu('Route by sentiment');
    await expect(heading).toHaveText('Route by sentiment');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(runStatus).toHaveText('Run finished: 5 nodes done, 1 skipped');
    await expect(runPreview('Positive', 'result')).toHaveText('positive');
    await expect(node('Negative')).toHaveAccessibleDescription(
      /Run status: skipped, its branch was not taken\./,
    );
    await expect(node('Negative').getByText('Skipped', { exact: true })).toBeVisible();
    await expect(runPreview('Negative', 'result')).toHaveCount(0);

    // "Extract a JSON field": the mock answers with JSON, which the Transforms parse and read.
    await chooseFromNewMenu('Extract a JSON field');
    await expect(heading).toHaveText('Extract a JSON field');
    await runButton.click();
    await expect(runStatus).toHaveText('Run finished: 6 nodes done');
    await expect(runPreview('Email', 'result')).toHaveText('ada@example.com');
    await expect(toasts).toHaveCount(0);

    // A selected node's values are in full in the inspector, also for a node whose card shows
    // none, like a Transform.
    await node('Parse JSON').focus();
    await page.keyboard.press('Enter');
    await expect(inspector.getByRole('heading', { name: 'Parse JSON', level: 3 })).toBeVisible();
    await expect(runOutput).toContainText('Done');
    await expect(runOutput.getByRole('figure', { name: 'result' })).toContainText(
      '"email": "ada@example.com"',
    );
    await expectNoA11yViolations();
  });

  test('stops a run, and does not run a pipeline with errors', async ({ page }) => {
    await page.goto('/');
    const {
      templateButtons,
      node,
      inspector,
      runButton,
      stopButton,
      runStatus,
      runPreview,
      toasts,
      select,
    } = editor(page);
    const requests = recordLlmRequests(page);
    await templateButtons.getByRole('button', { name: 'Ask a question' }).click();

    // Stop cancels the run while the answer streams in, and the browser drops the stream. The
    // nodes that had not ended are cancelled, and the Model keeps the text it got.
    const dropped = page.waitForEvent('requestfailed', (request) => isLlmStream(request.url()));
    await runButton.click();
    await expect(runPreview('Model', 'response')).toContainText('**Why is the sky blue?**');
    await stopButton.click();
    await expect(runStatus).toHaveText('Run stopped');
    await dropped;
    await expect(node('Answer prompt')).toHaveAccessibleDescription(/Run status: done\./);
    for (const name of ['Model', 'Answer']) {
      await expect(node(name)).toHaveAccessibleDescription(/Run status: cancelled\./);
      await expect(node(name).getByText('Cancelled', { exact: true })).toBeVisible();
    }
    await expect(runPreview('Model', 'response')).toContainText('**Why is the sky blue?**');
    await expect(runPreview('Answer', 'result')).toHaveCount(0);
    await expect(stopButton).toHaveAttribute('aria-disabled', 'true');
    await expect(runButton).not.toHaveAttribute('aria-disabled');
    await expect(toasts).toHaveCount(0);

    // A question left empty is an error: Run is unavailable and says why.
    await select('Question');
    await inspector.getByRole('textbox', { name: 'Value' }).fill('');
    await expect(runButton).toHaveAttribute('aria-disabled', 'true');
    await expect(runButton).toHaveAccessibleDescription('Fix 1 error to run');
    // It stays focusable, so a keyboard user reaches it and its tooltip tells the reason; pressed,
    // it says the reason again instead of running.
    await runButton.focus();
    await expect(page.getByRole('tooltip')).toHaveText('Fix 1 error to run');
    await page.keyboard.press('Enter');
    await expect(runStatus).toHaveText('Fix 1 error to run');
    expect(requests).toHaveLength(1);
  });

  test('asks for the API key a real provider needs and keeps it out of files and storage', async ({
    page,
    expectNoA11yViolations,
    allowConsoleErrors,
  }) => {
    // Not a real key: the one request made with it is answered here, never by a provider.
    const apiKey = 'sk-ant-e2e-0000-not-a-real-key';
    await page.goto('/');
    const {
      templateButtons,
      node,
      inspector,
      runButton,
      runStatus,
      apiKeysDialog,
      toast,
      select,
      exportFile,
    } = editor(page);
    const keyField = apiKeysDialog.getByLabel('Anthropic', { exact: true });
    const remember = apiKeysDialog.getByRole('checkbox', { name: 'Remember on this device' });
    const save = apiKeysDialog.getByRole('button', { name: 'Save' });
    const exportedFile = async () => readFile(await (await exportFile()).path(), 'utf8');
    const requests = recordLlmRequests(page);

    await templateButtons.getByRole('button', { name: 'Ask a question' }).click();
    await select('Model');
    await inspector
      .getByRole('combobox', { name: 'Provider' })
      .selectOption({ label: 'Anthropic (your API key)' });

    // Without a key, Run asks for one at its field and sends nothing.
    await runButton.click();
    await expect(apiKeysDialog).toBeVisible();
    await expect(keyField).toBeFocused();
    await expectNoA11yViolations();
    await keyField.fill(apiKey);
    await expect(remember).not.toBeChecked();
    await save.click();
    await expect(apiKeysDialog).toBeHidden();
    await expect(runButton).toBeFocused();
    expect(requests).toHaveLength(0);

    // Not remembered, the key stays out of localStorage, where the draft is autosaved, and out
    // of the exported file, which keeps the provider.
    await expect.poll(() => localStorageEntriesWith(page, '"anthropic"')).toEqual(['pb:pipeline']);
    expect(await localStorageEntriesWith(page, apiKey)).toEqual([]);
    const exported = await exportedFile();
    expect(exported).toContain('"anthropic"');
    expect(exported).not.toContain(apiKey);

    // The run sends the key to the proxy on the same origin only. A provider that rejects it is
    // faked here: the proxy would call the real API. The browser logs the failed response.
    allowConsoleErrors(/^Failed to load resource: the server responded with a status of 401 /);
    await page.route(`**${LLM_STREAM_PATH}`, (route) =>
      route.fulfill({
        status: 401,
        json: { error: { code: 'invalid-key', message: 'The Anthropic API key was rejected.' } },
      }),
    );
    await runButton.click();
    await expect(toast('Run failed')).toContainText('Model: The Anthropic API key was rejected.');
    await expect(runStatus).toHaveText('Run failed');
    // The Model failed with the provider's message, and the Answer, which needs it, is skipped.
    await expect(node('Model')).toHaveAccessibleDescription(
      /Run status: failed\. The Anthropic API key was rejected\./,
    );
    await expect(
      node('Model').getByText('The Anthropic API key was rejected.', { exact: true }),
    ).toBeVisible();
    await expect(node('Answer')).toHaveAccessibleDescription(
      /Run status: skipped, a node it depends on failed\./,
    );
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url()).toBe(new URL(LLM_STREAM_PATH, page.url()).href);
    expect(await request?.headerValue('authorization')).toBe(`Bearer ${apiKey}`);
    expect(page.url()).not.toContain(apiKey);
    await expectNoA11yViolations();

    // The toast leads back to the key, which can be remembered on this device: then it is in
    // localStorage, under its own entry only, and still not in the exported file.
    await toast('Run failed').getByRole('button', { name: 'Add API key' }).click();
    await expect(keyField).toBeFocused();
    await expect(keyField).toHaveValue(apiKey);
    await remember.check();
    await save.click();
    await expect(apiKeysDialog).toBeHidden();
    await expect
      .poll(() => localStorageEntriesWith(page, apiKey))
      .toEqual(['pb:api-key:anthropic']);
    expect(await exportedFile()).not.toContain(apiKey);
  });
});
