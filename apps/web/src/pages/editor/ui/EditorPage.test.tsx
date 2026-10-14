import {
  addNode,
  connect,
  createEmptyPipeline,
  NODE_DEFINITIONS,
  parsePipelineFile,
  serializePipeline,
} from '@pipeline-builder/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
