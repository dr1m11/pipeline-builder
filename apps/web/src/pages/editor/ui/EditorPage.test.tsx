import {
  addNode,
  connect,
  createEmptyPipeline,
  formatLlmStreamEvent,
  LLM_REQUEST_SCHEMA,
  type LlmProvider,
  type LlmRequest,
  type LlmStreamEvent,
  mockCompletion,
  NODE_DEFINITIONS,
  parsePipelineFile,
  type Pipeline,
  PIPELINE_TEMPLATES,
  serializePipeline,
  splitIntoTokens,
} from '@pipeline-builder/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearApiKey, getApiKey, isApiKeyRemembered, saveApiKey } from '@/entities/api-key';
import { DRAFT_STORAGE_KEY, UNREADABLE_DRAFT_STORAGE_KEY } from '@/entities/pipeline';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { EditorPage } from './EditorPage';

function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ToastProvider>{children}</ToastProvider>
    </TooltipProvider>
  );
}

function renderPage() {
  render(<EditorPage />, { wrapper: Providers });
  return { user: userEvent.setup() };
}

/** Presses Enter on a port: the first port starts a connection, the second completes it. */
async function activatePort(
  user: ReturnType<typeof userEvent.setup>,
  nodeName: string,
  portName: string,
) {
  const node = await screen.findByRole('group', { name: nodeName });
  const port = within(node).getByRole('button', { name: portName });
  act(() => {
    port.focus();
  });
  await user.keyboard('{Enter}');
}

function notifications() {
  return within(screen.getByRole('region', { name: 'Notifications (F8)' }));
}

/** The pipeline in the autosaved draft, or null when there is none. */
function savedPipeline() {
  const text = window.localStorage.getItem(DRAFT_STORAGE_KEY);
  if (text === null) return null;
  const parsed = parsePipelineFile(text);
  if (!parsed.ok) throw new Error(`The draft cannot be read: ${parsed.error.code}`);
  return parsed.value.pipeline;
}

/** "Ask a question": Input → Prompt. */
function askPipeline() {
  let pipeline = createEmptyPipeline({ id: 'saved', name: 'Ask a question' });
  pipeline = addNode(pipeline, { kind: 'input', id: 'input', position: { x: 0, y: 0 } }).pipeline;
  pipeline = addNode(pipeline, {
    kind: 'prompt',
    id: 'prompt',
    position: { x: 320, y: 40 },
  }).pipeline;
  const result = connect(
    pipeline,
    { source: 'input', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
    'input-prompt',
  );
  if (!result.ok) throw new Error(`Cannot connect: ${result.error}`);
  return result.value.pipeline;
}

describe('EditorPage', () => {
  it('shows the pipeline name, the node palette and the canvas region', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Untitled pipeline' }),
    ).toBeInTheDocument();
    const palette = screen.getByRole('complementary', { name: 'Node palette' });
    expect(within(palette).getByRole('button', { name: 'Add Input' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Pipeline canvas' })).toBeInTheDocument();
  });

  it('hints how to start until the canvas has a node', async () => {
    const { user } = renderPage();
    const hint = 'Drag a node from the palette, or click one, to start your pipeline.';
    expect(screen.getByText(hint)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Input' }));

    expect(await screen.findByRole('group', { name: 'Input 1' })).toBeInTheDocument();
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  it('shows the properties of a node it adds', async () => {
    const { user } = renderPage();
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(
      within(inspector).getByText('Select a node to edit its properties.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));

    expect(within(inspector).getByRole('textbox', { name: 'Name' })).toHaveValue('Prompt 1');
    expect(within(inspector).getByRole('textbox', { name: 'Template' })).toBeInTheDocument();
  });

  it('edits text in a field without deleting the selected node', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const name = screen.getByRole('textbox', { name: 'Name' });

    await user.click(name);
    await user.keyboard('{Backspace}{Delete}{Backspace}');

    expect(name).toHaveValue('Prompt');
    expect(await screen.findByRole('group', { name: 'Prompt' })).toBeInTheDocument();
  });

  it('takes the user from a problem to its node on the canvas', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    await user.click(screen.getByRole('button', { name: 'Add LLM Call' }));
    const problems = screen.getByRole('list', { name: 'Problems of the pipeline' });

    await user.click(
      within(problems).getByRole('button', {
        name: 'Error: Prompt 1, Input "question" is not connected',
      }),
    );

    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByRole('heading', { level: 3, name: 'Prompt 1' })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Prompt 1' })).toHaveFocus();
    });
  });

  it('links to the source code in a new tab', () => {
    renderPage();

    const link = screen.getByRole('link', { name: 'Source code on GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/dr1m11/pipeline-builder');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('EditorPage undo and redo', () => {
  // Changes merge in the history when each follows the last within a second. With the clock
  // stopped, every burst of typing or nudging falls within that window, however slow the machine.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const undoButton = (change: string) => screen.getByRole('button', { name: `Undo ${change}` });

  it('offers undo and redo in the Edit toolbar, disabled at first', () => {
    renderPage();

    const toolbar = screen.getByRole('toolbar', { name: 'Edit' });
    expect(within(toolbar).getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(within(toolbar).getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('undoes typing in a field in one step and shows the old value', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const template = screen.getByRole('textbox', { name: 'Template' });
    const original = NODE_DEFINITIONS.prompt.createData().template;

    await user.type(template, 'abc');
    expect(template).toHaveValue(`${original}abc`);
    await user.click(undoButton('Edit Template of Prompt 1'));

    await waitFor(() => {
      expect(template).toHaveValue(original);
    });
    expect(undoButton('Add Prompt')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Redo Edit Template of Prompt 1' })).toBeEnabled();
  });

  it('undoes arrow-key nudges of a node in one step', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const node = await screen.findByRole('group', { name: 'Prompt 1' });
    act(() => {
      node.focus();
    });

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowDown}');
    expect(undoButton('Move Prompt 1')).toBeEnabled();
    await user.keyboard('{Control>}z{/Control}');

    expect(undoButton('Add Prompt')).toBeEnabled();
  });

  it('brings back a deleted node with its edge', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Input' }));
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    await activatePort(user, 'Input 1', 'Output value (text)');
    await activatePort(user, 'Prompt 1', 'Input question (text)');
    const edgeName = 'Input 1 value to Prompt 1 question';
    expect(await screen.findByRole('group', { name: edgeName })).toBeInTheDocument();

    act(() => {
      screen.getByRole('group', { name: 'Prompt 1' }).focus();
    });
    await user.keyboard('{Delete}');
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('group', { name: edgeName })).not.toBeInTheDocument();
    await user.click(undoButton('Delete Prompt 1'));

    expect(await screen.findByRole('group', { name: 'Prompt 1' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: edgeName })).toBeInTheDocument();
  });

  it('forgets what could be redone once something else changes', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Input' }));
    await user.click(undoButton('Add Input'));
    expect(screen.getByRole('button', { name: 'Redo Add Input' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Add Output' }));

    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('stops editing a node whose addition is undone', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByRole('textbox', { name: 'Name' })).toHaveValue('Prompt 1');

    await user.click(undoButton('Add Prompt'));

    expect(screen.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument();
    expect(
      within(inspector).getByText('Select a node to edit its properties.'),
    ).toBeInTheDocument();
  });

  it('undoes a choice with Ctrl+Z while its select has focus', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Transform' }));
    const operation = screen.getByRole('combobox', { name: 'Operation' });
    const original = NODE_DEFINITIONS.transform.createData().operation;

    await user.selectOptions(operation, 'Get field');
    expect(operation).toHaveFocus();
    await user.keyboard('{Control>}z{/Control}');

    await waitFor(() => {
      expect(operation).toHaveValue(original);
    });
    expect(undoButton('Add Transform')).toBeEnabled();
  });

  it('undoes a connection with Ctrl+Z while its port still has focus', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Input' }));
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    await activatePort(user, 'Input 1', 'Output value (text)');
    await activatePort(user, 'Prompt 1', 'Input question (text)');
    const edgeName = 'Input 1 value to Prompt 1 question';
    expect(await screen.findByRole('group', { name: edgeName })).toBeInTheDocument();
    const port = within(screen.getByRole('group', { name: 'Prompt 1' })).getByRole('button', {
      name: 'Input question (text)',
    });
    expect(port).toHaveFocus();

    await user.keyboard('{Control>}z{/Control}');

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: edgeName })).not.toBeInTheDocument();
    });
    expect(undoButton('Add Prompt')).toBeEnabled();
  });

  it('keeps the node and the focus on its select when selection keys are pressed there', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Transform' }));
    await user.click(screen.getByRole('button', { name: 'Add Output' }));
    await user.click(screen.getByRole('button', { name: 'Add Transform' }));
    const operation = screen.getByRole('combobox', { name: 'Operation' });
    act(() => {
      operation.focus();
    });

    await user.keyboard('{Escape}{Control>}a{/Control}{Control>}d{/Control}');

    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByRole('heading', { level: 3, name: 'Transform 2' })).toBeVisible();
    expect(operation).toHaveFocus();
    expect(screen.queryByRole('group', { name: 'Transform 3' })).not.toBeInTheDocument();
  });

  it('leaves Ctrl+Z in a text field to the field', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    await user.type(name, ' draft');

    await user.keyboard('{Control>}z{/Control}');

    expect(name).toHaveValue('Prompt 1 draft');
    expect(screen.getByRole('group', { name: 'Prompt 1 draft' })).toBeInTheDocument();
    expect(undoButton('Rename Prompt 1')).toBeEnabled();
  });
});

describe('EditorPage autosave', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the pipeline saved in this browser', async () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, serializePipeline(askPipeline()));

    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Ask a question' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Input 1' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Prompt 1' })).toBeInTheDocument();
    expect(
      await screen.findByRole('group', { name: 'Input 1 value to Prompt 1 question' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Drag a node from the palette, or click one, to start your pipeline.'),
    ).not.toBeInTheDocument();
    // The saved pipeline is where editing starts, not a change to undo.
    const toolbar = screen.getByRole('toolbar', { name: 'Edit' });
    expect(within(toolbar).getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('saves the pipeline shortly after an edit', async () => {
    const { user } = renderPage();

    await user.click(screen.getByRole('button', { name: 'Add Input' }));

    await waitFor(() => {
      expect(savedPipeline()?.nodes.map((node) => node.label)).toEqual(['Input 1']);
    });
    expect(savedPipeline()?.name).toBe('Untitled pipeline');
  });

  it('starts empty and says so when the saved pipeline cannot be read', () => {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, '{"format": "pipeline-builder"');

    renderPage();

    expect(
      screen.getByText('Drag a node from the palette, or click one, to start your pipeline.'),
    ).toBeInTheDocument();
    const toast = notifications().getByRole('listitem');
    expect(toast).toHaveTextContent('Couldn’t restore your last pipeline');
    expect(toast).toHaveTextContent('A copy of the saved data was kept in this browser.');
    expect(window.localStorage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBe(
      '{"format": "pipeline-builder"',
    );
  });

  it('says once when storage is full', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    const { user } = renderPage();

    await user.click(screen.getByRole('button', { name: 'Add Input' }));
    const toast = await notifications().findByRole('listitem');
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    await waitFor(() => {
      expect(setItem).toHaveBeenCalledTimes(2);
    });

    expect(notifications().getAllByRole('listitem')).toEqual([toast]);
    expect(toast).toHaveTextContent('Couldn’t save your changes');
    expect(toast).toHaveTextContent(
      'Browser storage is full, so changes are no longer saved in this browser.',
    );
  });
});

describe('EditorPage templates', () => {
  it('starts from a template offered on the empty canvas', async () => {
    const { user } = renderPage();
    const canvas = screen.getByRole('main', { name: 'Pipeline canvas' });
    const templates = within(canvas).getByRole('group', { name: 'Start from a template:' });

    await user.click(within(templates).getByRole('button', { name: 'Ask a question' }));

    for (const name of ['Question', 'Answer prompt', 'Model', 'Answer']) {
      expect(await screen.findByRole('group', { name })).toBeInTheDocument();
    }
    expect(
      await screen.findByRole('group', { name: 'Question value to Answer prompt question' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Ask a question' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Start from a template:' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Problems: none' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Undo Load template “Ask a question”' }),
    ).toBeEnabled();
    // The button left with the hint; focus goes on from the canvas, not from the top of the page.
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Question' })).toHaveFocus();
    });
    expect(document.body).not.toHaveFocus();
  });

  it('replaces the pipeline from the New menu first in the File toolbar', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const toolbar = screen.getByRole('toolbar', { name: 'File' });
    const [first] = within(toolbar).getAllByRole('button');
    expect(first).toHaveAccessibleName('New');

    await user.click(within(toolbar).getByRole('button', { name: 'New' }));
    await user.click(screen.getByRole('menuitem', { name: 'Route by sentiment' }));

    expect(await screen.findByRole('group', { name: 'Is positive?' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument();
    expect(notifications().getByRole('listitem')).toHaveTextContent('Loaded “Route by sentiment”');

    await user.click(within(toolbar).getByRole('button', { name: 'New' }));
    await user.click(screen.getByRole('menuitem', { name: 'Blank pipeline' }));

    await waitFor(() => {
      expect(screen.queryByRole('group', { name: 'Is positive?' })).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { level: 1, name: 'Untitled pipeline' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Start from a template:' })).toBeInTheDocument();
  });
});

describe('EditorPage import', () => {
  const imported = addNode(createEmptyPipeline({ id: 'ask', name: 'Ask a question' }), {
    kind: 'input',
    id: 'question',
    position: { x: 0, y: 0 },
  }).pipeline;

  it('offers import and export in the File toolbar', () => {
    renderPage();

    const toolbar = screen.getByRole('toolbar', { name: 'File' });
    expect(within(toolbar).getByRole('button', { name: 'Import pipeline' })).toBeEnabled();
    expect(within(toolbar).getByRole('button', { name: 'Export pipeline' })).toBeEnabled();
  });

  it('opens an imported pipeline in place of the draft, and undoes it from the toast', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const file = new File([serializePipeline(imported)], 'ask.pipeline.json', {
      type: 'application/json',
    });

    await user.upload(screen.getByLabelText('Pipeline file'), file);

    expect(await screen.findByRole('group', { name: 'Input 1' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Prompt 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Ask a question' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo Import “Ask a question”' })).toBeEnabled();
    const region = screen.getByRole('region', { name: 'Notifications (F8)' });
    expect(within(region).getByRole('listitem')).toHaveTextContent('Imported “Ask a question”');
    // The import ends after the file is read, outside any user event, and Radix lets pointer
    // events into the toast region only in an effect after the toast renders.
    await waitFor(() => {
      expect(region).not.toHaveStyle({ pointerEvents: 'none' });
    });

    await user.click(within(region).getByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('group', { name: 'Prompt 1' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Input 1' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Untitled pipeline' }),
    ).toBeInTheDocument();
  });
});

describe('EditorPage keyboard shortcuts help', () => {
  const helpButton = () => screen.getByRole('button', { name: 'Keyboard shortcuts' });

  it('opens with ? and lists the shortcuts of the editor and its canvas', async () => {
    const { user } = renderPage();

    await user.keyboard('?');

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(
      within(dialog)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Edit', 'Run', 'Canvas', 'Help']);
    const edit = within(dialog).getByRole('table', { name: 'Edit' });
    for (const row of [
      'Undo Ctrl Z',
      'Redo Ctrl Shift Z or Ctrl Y',
      'Paste Ctrl V',
      'Duplicate Ctrl D',
    ]) {
      expect(within(edit).getByRole('row', { name: row })).toBeInTheDocument();
    }
    const run = within(dialog).getByRole('table', { name: 'Run' });
    for (const row of ['Run the pipeline Ctrl Enter', 'Stop the run Ctrl .']) {
      expect(within(run).getByRole('row', { name: row })).toBeInTheDocument();
    }
    const canvas = within(dialog).getByRole('table', { name: 'Canvas' });
    for (const row of [
      'Delete the selection Delete or Backspace',
      'Move the focused selection Arrow keys',
      'Move the focused selection further Shift Arrow keys',
      'Select the nodes in an area Shift Drag',
      'Add to or remove from the selection Ctrl Click',
    ]) {
      expect(within(canvas).getByRole('row', { name: row })).toBeInTheDocument();
    }
    const help = within(dialog).getByRole('table', { name: 'Help' });
    expect(
      within(help).getByRole('row', { name: 'Show keyboard shortcuts ?' }),
    ).toBeInTheDocument();
  });

  it('opens from the header and closes with Escape, back on its button', async () => {
    const { user } = renderPage();

    await user.click(helpButton());
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(helpButton()).toHaveFocus();
  });

  it('gives focus back to the canvas node it was opened from with ?', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const node = await screen.findByRole('group', { name: 'Prompt 1' });
    act(() => {
      node.focus();
    });

    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(node).toHaveFocus();
  });

  it('keeps the selected node when Delete or Backspace is pressed in the help', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    expect(await screen.findByRole('group', { name: 'Prompt 1' })).toBeInTheDocument();

    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveFocus();
    await user.keyboard('{Delete}{Backspace}{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Prompt 1' })).toBeInTheDocument();
    const toolbar = screen.getByRole('toolbar', { name: 'Edit' });
    expect(within(toolbar).getByRole('button', { name: 'Undo Add Prompt' })).toBeEnabled();
  });

  it('leaves ? typed in a text field to the field', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));
    const name = screen.getByRole('textbox', { name: 'Name' });

    await user.type(name, '?');

    expect(name).toHaveValue('Prompt 1?');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('EditorPage API keys', () => {
  const apiKeysButton = () => screen.getByRole('button', { name: 'API keys' });
  const objectUrlMethods = (['createObjectURL', 'revokeObjectURL'] as const).map(
    (name) => [name, Object.getOwnPropertyDescriptor(URL, name)] as const,
  );

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [name, descriptor] of objectUrlMethods) {
      if (descriptor === undefined) Reflect.deleteProperty(URL, name);
      else Object.defineProperty(URL, name, descriptor);
    }
    clearApiKey('anthropic');
    clearApiKey('openai');
  });

  it('opens the API keys dialog from the header and gives focus back to its button', async () => {
    const { user } = renderPage();

    await user.click(apiKeysButton());
    const dialog = screen.getByRole('dialog', { name: 'API keys' });
    expect(within(dialog).getByLabelText('Anthropic')).toHaveFocus();
    expect(within(dialog).getByLabelText('OpenAI')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(apiKeysButton()).toHaveFocus();
  });

  it('keeps a saved key out of the pipeline, its autosaved draft and its exported file', async () => {
    const secret = 'sk-ant-secret-0123456789';
    // jsdom has no object URLs and cannot download: the exported file is read from its blob.
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:exported-pipeline');
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: vi.fn() },
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Add LLM Call' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Provider' }),
      'Anthropic (your API key)',
    );

    await user.click(apiKeysButton());
    await user.type(screen.getByLabelText('Anthropic'), secret);
    await user.click(screen.getByRole('checkbox', { name: 'Remember on this device' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await user.click(screen.getByRole('button', { name: 'Add Output' }));

    // The key is saved, under its own storage key only.
    expect(getApiKey('anthropic')).toBe(secret);
    expect(isApiKeyRemembered('anthropic')).toBe(true);
    await waitFor(() => {
      expect(savedPipeline()?.nodes.map((node) => node.label)).toEqual(['LLM Call 1', 'Output 1']);
    });
    expect(savedPipeline()?.nodes[0]?.data).toMatchObject({ provider: 'anthropic' });
    expect(storedEntriesWith(window.localStorage, secret)).toEqual(['pb:api-key:anthropic']);
    expect(storedEntriesWith(window.sessionStorage, secret)).toEqual([]);
    expect(window.localStorage.getItem(DRAFT_STORAGE_KEY)).not.toContain(secret);

    await user.click(screen.getByRole('button', { name: 'Export pipeline' }));

    const [blob] = createObjectURL.mock.calls[0] ?? [];
    const exported = (await blob?.text()) ?? '';
    expect(parsePipelineFile(exported)).toMatchObject({
      ok: true,
      value: { pipeline: { nodes: [{ data: { provider: 'anthropic' } }, { label: 'Output 1' }] } },
    });
    expect(exported).not.toContain(secret);
    expect(window.location.href).not.toContain(secret);
  });
});

describe('EditorPage runs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearApiKey('anthropic');
  });

  const runToolbar = () => within(screen.getByRole('toolbar', { name: 'Run' }));
  const runButton = () => runToolbar().getByRole('button', { name: 'Run' });
  const stopButton = () => runToolbar().getByRole('button', { name: 'Stop' });
  const runStatus = () => runToolbar().getByRole('status');

  /** "Ask a question" with its Model on `provider`, as the autosaved draft the editor opens. */
  function openAskPipeline(provider: LlmProvider) {
    const template = PIPELINE_TEMPLATES.find(({ id }) => id === 'ask-a-question');
    if (template === undefined) throw new Error('The "Ask a question" template is missing');
    const pipeline: Pipeline = {
      ...template.pipeline,
      nodes: template.pipeline.nodes.map((node) =>
        node.kind === 'llm-call' ? { ...node, data: { ...node.data, provider } } : node,
      ),
    };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, serializePipeline(pipeline));
  }

  /** An event stream that sends `events` and, unless `open`, ends. */
  function eventStream(events: readonly LlmStreamEvent[], { open = false } = {}): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const streamEvent of events) {
          const { event, data } = formatLlmStreamEvent(streamEvent);
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        }
        if (!open) controller.close();
      },
    });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  }

  /**
   * Stands in for the proxy on the network: each request it gets is answered by `answer`. By
   * default it streams the mock provider's completion, as the proxy does.
   */
  function stubProxy(
    answer: (request: LlmRequest) => Response = (request) =>
      eventStream([
        ...splitIntoTokens(mockCompletion(request)).map((text) => ({
          type: 'token' as const,
          text,
        })),
        { type: 'done' },
      ]),
  ) {
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      const body = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(answer(LLM_REQUEST_SCHEMA.parse(JSON.parse(body))));
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('runs a template through the proxy and announces the end', async () => {
    const fetchMock = stubProxy();
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Ask a question' }));

    await user.click(runButton());

    await waitFor(() => {
      expect(runStatus()).toHaveTextContent('Run finished: 4 nodes done');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] ?? [];
    expect(endpoint).toBe('/api/llm/stream');
    expect(init?.method).toBe('POST');
    expect(runButton()).not.toHaveAttribute('aria-disabled');
  });

  it('runs again with Ctrl+Enter from the text a node shows', async () => {
    const fetchMock = stubProxy();
    openAskPipeline('mock');
    const { user } = renderPage();
    await user.click(runButton());
    await waitFor(() => {
      expect(runStatus()).toHaveTextContent('Run finished: 4 nodes done');
    });
    const answer = screen.getByRole('group', { name: 'Answer' });
    act(() => {
      within(answer).getByRole('textbox', { name: 'Answer result' }).focus();
    });

    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the run on the nodes and the selected node’s output in the inspector', async () => {
    const fetchMock = stubProxy();
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Ask a question' }));

    await user.click(runButton());

    await waitFor(() => {
      expect(runStatus()).toHaveTextContent('Run finished: 4 nodes done');
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    const answer = mockCompletion(
      LLM_REQUEST_SCHEMA.parse(JSON.parse(typeof body === 'string' ? body : '')),
    );
    const model = screen.getByRole('group', { name: 'Model' });
    expect(model).toHaveAccessibleDescription(/Run status: done\./);
    const answerNode = screen.getByRole('group', { name: 'Answer' });
    // As written: line breaks and list markers kept.
    expect(within(answerNode).getByRole('textbox', { name: 'Answer result' })).toHaveTextContent(
      answer,
      { normalizeWhitespace: false },
    );

    act(() => {
      model.focus();
    });
    await user.keyboard('{Enter}');

    const runOutput = screen.getByRole('region', { name: 'Run output' });
    expect(within(runOutput).getByText('Done')).toBeInTheDocument();
    expect(within(runOutput).getByRole('figure', { name: 'response' })).toHaveTextContent(answer, {
      normalizeWhitespace: false,
    });
  });

  it('keeps Run unavailable while the pipeline has errors', async () => {
    const { user } = renderPage();
    expect(runButton()).toHaveAccessibleDescription('Add a node to run');

    await user.click(screen.getByRole('button', { name: 'Add Prompt' }));

    expect(runButton()).toHaveAttribute('aria-disabled', 'true');
    expect(runButton()).toHaveAccessibleDescription('Fix 1 error to run');
  });

  it('runs with Ctrl+Enter on a selected node, which stays selected', async () => {
    const fetchMock = stubProxy();
    openAskPipeline('mock');
    const { user } = renderPage();
    const model = await screen.findByRole('group', { name: 'Model' });
    act(() => {
      model.focus();
    });
    await user.keyboard('{Enter}');
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByRole('heading', { level: 3, name: 'Model' })).toBeVisible();

    // React Flow would take Ctrl+Enter as Enter with its multi-selection key, and deselect.
    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => {
      expect(runStatus()).toHaveTextContent('Run finished: 4 nodes done');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(within(inspector).getByRole('heading', { level: 3, name: 'Model' })).toBeVisible();
    expect(model).toHaveFocus();
  });

  it('runs with Ctrl+Enter on a focused port without starting a connection', async () => {
    const fetchMock = stubProxy();
    openAskPipeline('mock');
    const { user } = renderPage();
    const port = (nodeName: string, portName: string) =>
      within(screen.getByRole('group', { name: nodeName })).getByRole('button', {
        name: portName,
      });
    await screen.findByRole('group', { name: 'Model' });
    act(() => {
      port('Model', 'Output response (text)').focus();
    });

    await user.keyboard('{Control>}{Enter}{/Control}');

    await waitFor(() => {
      expect(runStatus()).toHaveTextContent('Run finished: 4 nodes done');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A started connection would have disabled the ports it cannot end on, such as other outputs.
    expect(port('Question', 'Output value (text)')).not.toHaveAttribute('aria-disabled');
  });

  it('stops a run with Ctrl+. and lets the user edit meanwhile', async () => {
    const fetchMock = stubProxy(() =>
      eventStream([{ type: 'token', text: 'Because' }], { open: true }),
    );
    openAskPipeline('mock');
    const { user } = renderPage();

    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => {
      expect(stopButton()).not.toHaveAttribute('aria-disabled');
    });
    await user.click(screen.getByRole('button', { name: 'Add Output' }));
    await user.keyboard('{Control>}.{/Control}');

    await waitFor(() => {
      expect(runStatus()).toHaveTextContent('Run stopped');
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(await screen.findByRole('group', { name: 'Output 1' })).toBeInTheDocument();
  });

  it('asks for a missing API key, then gives focus back to Run', async () => {
    const fetchMock = stubProxy();
    openAskPipeline('anthropic');
    const { user } = renderPage();

    await user.click(runButton());

    const dialog = screen.getByRole('dialog', { name: 'API keys' });
    expect(within(dialog).getByLabelText('Anthropic')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(runButton()).toHaveFocus();
  });

  it('shows a rejected key in a toast that offers to add another', async () => {
    saveApiKey('anthropic', 'sk-ant-revoked', { remember: false });
    stubProxy(() =>
      eventStream([{ type: 'error', code: 'invalid-key', message: 'The API key was rejected.' }]),
    );
    openAskPipeline('anthropic');
    const { user } = renderPage();

    await user.click(runButton());

    const toast = await notifications().findByRole('listitem');
    expect(toast).toHaveTextContent('Run failed');
    expect(toast).toHaveTextContent('Model: The API key was rejected.');
    expect(runStatus()).toHaveTextContent(/^Run failed$/);
    const region = screen.getByRole('region', { name: 'Notifications (F8)' });
    await waitFor(() => {
      expect(region).not.toHaveStyle({ pointerEvents: 'none' });
    });
    await user.click(within(toast).getByRole('button', { name: 'Add API key' }));

    const dialog = screen.getByRole('dialog', { name: 'API keys' });
    expect(within(dialog).getByLabelText('Anthropic')).toHaveFocus();
  });
});

/** Keys of the entries of `storage` whose value contains `text`. */
function storedEntriesWith(storage: Storage, text: string): string[] {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  return keys.filter(
    (key): key is string => key !== null && (storage.getItem(key) ?? '').includes(text),
  );
}
