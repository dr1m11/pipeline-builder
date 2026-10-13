import { expect, test } from './fixtures';

test.describe('validation', () => {
  test('shows validation errors and leads to fixing them', async ({
    page,
    expectNoA11yViolations,
  }) => {
    await page.goto('/');
    const palette = page.getByRole('complementary', { name: 'Node palette' });
    const canvas = page.getByRole('main', { name: 'Pipeline canvas' });
    const inspector = page.getByRole('complementary', { name: 'Inspector' });
    const problems = inspector.getByRole('list', { name: 'Problems of the pipeline' });
    // Nodes and edges are both groups. Names are exact: an edge is named after its nodes, and an
    // edge with a problem also says what is wrong. React Flow renders an edge only when it can draw
    // it to both handles, so an attached edge is a drawn one (a straight edge has no height, which
    // `toBeVisible` would count as hidden).
    const node = (name: string) => canvas.getByRole('group', { name, exact: true });
    const edge = node;
    const port = (nodeName: string, portName: string) =>
      node(nodeName).getByRole('button', { name: portName });
    const problem = (name: string) => problems.getByRole('button', { name, exact: true });
    const select = (nodeName: string) =>
      node(nodeName).getByText(nodeName, { exact: true }).click();

    // A fresh editor has nothing to complain about.
    await expect(inspector.getByRole('button', { name: 'Problems: none' })).toBeVisible();
    await expect(inspector.getByText('No problems')).toBeVisible();

    for (const kind of ['Input', 'Prompt', 'LLM Call', 'Output']) {
      await palette.getByRole('button', { name: `Add ${kind}` }).press('Enter');
    }
    await expect(palette.getByRole('status')).toHaveText('Added Output 1');

    // Every node needs something: a value, its inputs connected, a path to the Output.
    await expect(
      inspector.getByRole('button', { name: 'Problems: 4 errors, 3 warnings' }),
    ).toBeVisible();
    await expect(problem('Error: Input 1, Value: Required')).toBeVisible();
    await expect(problem('Error: Prompt 1, Input "question" is not connected')).toBeVisible();
    await expect(
      problem('Warning: LLM Call 1, Its result does not reach any Output'),
    ).toBeVisible();
    // The canvas shows them too: nodes are described by their problems, unconnected inputs are
    // marked.
    await expect(node('Prompt 1')).toHaveAccessibleDescription(/Input "question" is not connected/);
    await expect(port('Prompt 1', 'Input question (text)')).toHaveAccessibleDescription(
      'Not connected',
    );
    await expectNoA11yViolations();

    // A field problem leads to its node and the field to fix.
    await problem('Error: Input 1, Value: Required').click();
    await expect(inspector.getByRole('heading', { name: 'Input 1', level: 3 })).toBeVisible();
    const value = inspector.getByRole('textbox', { name: 'Value' });
    await expect(value).toBeFocused();
    await page.keyboard.type('Why validate a pipeline?');
    await expect(problem('Error: Input 1, Value: Required')).toHaveCount(0);

    // Connect the chain; the whole pipeline then fits the canvas next to the inspector.
    await canvas.getByRole('button', { name: 'Fit View' }).click();
    await port('Input 1', 'Output value (text)').click();
    await port('Prompt 1', 'Input question (text)').click();
    await port('Prompt 1', 'Output prompt (text)').click();
    await port('LLM Call 1', 'Input prompt (text)').click();
    await port('LLM Call 1', 'Output response (text)').click();
    await port('Output 1', 'Input value (any)').click();
    await expect(edge('Input 1 value to Prompt 1 question')).toBeAttached();
    await expect(edge('Prompt 1 prompt to LLM Call 1 prompt')).toBeAttached();
    await expect(edge('LLM Call 1 response to Output 1 value')).toBeAttached();
    await expect(inspector.getByRole('button', { name: 'Problems: none' })).toBeVisible();

    // Removing a template variable removes its input, but its edge stays, drawn to a placeholder
    // and reported, until the variable is back.
    await select('Prompt 1');
    const template = inspector.getByRole('textbox', { name: 'Template' });
    await template.fill('Answer the question.');
    const broken = 'Input 1 value to Prompt 1 question, error: Input "question" no longer exists';
    await expect(edge(broken)).toBeAttached();
    await expect(node('Prompt 1').getByText('removed')).toBeVisible();
    await expect(
      problem('Error: Input 1 value → Prompt 1 question, Input "question" no longer exists'),
    ).toBeVisible();
    await template.fill('Answer the question: {{question}}');
    await expect(edge('Input 1 value to Prompt 1 question')).toBeAttached();
    await expect(edge(broken)).toHaveCount(0);

    // An out-of-range setting is reported next to the field, on the node and in the list.
    await select('LLM Call 1');
    const temperature = inspector.getByRole('spinbutton', { name: 'Temperature' });
    await temperature.fill('5');
    await expect(temperature).toHaveAccessibleDescription(/Must be from 0 to 2/);
    await expect(node('LLM Call 1')).toHaveAccessibleDescription(
      /Temperature: Must be from 0 to 2/,
    );
    await expect(problem('Error: LLM Call 1, Temperature: Must be from 0 to 2')).toBeVisible();
    await expectNoA11yViolations();
    await temperature.fill('0.7');
    await expect(temperature).not.toHaveAccessibleDescription(/Must be from 0 to 2/);

    await expect(inspector.getByRole('button', { name: 'Problems: none' })).toBeVisible();
    await expect(inspector.getByText('No problems')).toBeVisible();
    await expect(node('LLM Call 1')).not.toHaveAccessibleDescription(/problem/);
    await expectNoA11yViolations();
  });
});
