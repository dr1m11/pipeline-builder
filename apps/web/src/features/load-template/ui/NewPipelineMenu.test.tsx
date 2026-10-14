import {
  addNode,
  createEmptyPipeline,
  EMPTY_HISTORY,
  type Pipeline,
  PIPELINE_TEMPLATES,
} from '@pipeline-builder/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { NewPipelineMenu } from './NewPipelineMenu';

/** The pipeline being edited: one Input node. */
const draft: Pipeline = addNode(createEmptyPipeline({ id: 'draft', name: 'Draft' }), {
  kind: 'input',
  id: 'input',
  position: { x: 0, y: 0 },
}).pipeline;

const templateIds = new Set(
  PIPELINE_TEMPLATES.flatMap(({ pipeline }) => [
    pipeline.id,
    ...pipeline.nodes.map(({ id }) => id),
    ...pipeline.edges.map(({ id }) => id),
  ]),
);

function renderMenu(pipeline: Pipeline = draft) {
  const store = createPipelineStore(pipeline);
  render(
    <TooltipProvider delayDuration={0}>
      <ToastProvider>
        <PipelineStoreProvider store={store}>
          <NewPipelineMenu />
        </PipelineStoreProvider>
      </ToastProvider>
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  return {
    store,
    user,
    /** Opens the menu and picks `item`. */
    choose: async (item: string) => {
      await user.click(screen.getByRole('button', { name: 'New' }));
      await user.click(screen.getByRole('menuitem', { name: item }));
    },
  };
}

function notifications() {
  return within(screen.getByRole('region', { name: 'Notifications (F8)' }));
}

/** The toast's Undo button, once Radix lets pointer events into the toast region. */
async function findUndoAction(): Promise<HTMLElement> {
  const region = screen.getByRole('region', { name: 'Notifications (F8)' });
  const undo = await within(region).findByRole('button', { name: 'Undo' });
  await waitFor(() => {
    expect(region).not.toHaveStyle({ pointerEvents: 'none' });
  });
  return undo;
}

describe('NewPipelineMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers a blank pipeline and every template, described by what it does', async () => {
    const { user } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'New' }));

    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Blank pipeline',
      ...PIPELINE_TEMPLATES.map(({ name, description }) => `${name}${description}`),
    ]);
    expect(
      within(menu).getByRole('menuitem', { name: 'Route by sentiment' }),
    ).toHaveAccessibleDescription('Branches on a review’s sentiment');
    expect(within(menu).getByText('Templates')).toBeInTheDocument();
  });

  it('loads a template in place of the pipeline, with fresh ids, as one undoable step', async () => {
    const { store, choose } = renderMenu();

    await choose('Route by sentiment');

    const { pipeline, history } = store.getState();
    expect(pipeline.name).toBe('Route by sentiment');
    expect(pipeline.nodes.map((node) => node.label)).toEqual([
      'Review',
      'Sentiment prompt',
      'Classifier',
      'Is positive?',
      'Positive',
      'Negative',
    ]);
    expect(pipeline.edges).toHaveLength(5);
    const ids = [
      pipeline.id,
      ...pipeline.nodes.map(({ id }) => id),
      ...pipeline.edges.map(({ id }) => id),
    ];
    expect(ids.filter((id) => templateIds.has(id))).toEqual([]);
    expect(history.past.map((entry) => entry.label)).toEqual([
      'Load template “Route by sentiment”',
    ]);
    expect(store.getState().documentKey).toBe(1);

    store.getState().undo();
    expect(store.getState().pipeline).toBe(draft);
  });

  it('gives each load of a template new ids', async () => {
    const { store, choose } = renderMenu();
    await choose('Ask a question');
    const first = store.getState().pipeline;

    await choose('Ask a question');

    const second = store.getState().pipeline;
    expect(second.id).not.toBe(first.id);
    expect(
      second.nodes.map(({ id }) => id).filter((id) => first.nodes.some((node) => node.id === id)),
    ).toEqual([]);
  });

  it('offers to bring back the pipeline a template replaced', async () => {
    const { store, user, choose } = renderMenu();
    await choose('Ask a question');

    const toast = notifications().getByRole('listitem');
    expect(toast).toHaveTextContent('Loaded “Ask a question”');
    await user.click(await findUndoAction());

    expect(store.getState().pipeline).toBe(draft);
    expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('undoes nothing else from the toast once the pipeline has changed again', async () => {
    const { store, user, choose } = renderMenu();
    await choose('Ask a question');
    const undo = await findUndoAction();
    store.getState().addNode('output', { x: 0, y: 400 });
    const changed = store.getState().pipeline;

    await user.click(undo);

    expect(store.getState().pipeline).toBe(changed);
  });

  it('tells screen readers on Apple platforms the shortcut that undoes the replacement', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const { choose } = renderMenu();

    await choose('Extract a JSON field');

    await waitFor(() => {
      const announced = screen.getAllByRole('status').map((status) => status.textContent);
      expect(announced.join(' | ')).toContain('Press ⌘Z to bring back the previous pipeline');
    });
  });

  it('shows no toast when the canvas was empty', async () => {
    const { store, choose } = renderMenu(createEmptyPipeline({ id: 'draft', name: 'Draft' }));

    await choose('Extract a JSON field');

    expect(store.getState().pipeline.name).toBe('Extract a JSON field');
    expect(notifications().queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('starts a blank pipeline in place of the pipeline, and undoes it from the toast', async () => {
    const { store, user, choose } = renderMenu();

    await choose('Blank pipeline');

    const { pipeline, history } = store.getState();
    expect(pipeline).toEqual(createEmptyPipeline({ id: pipeline.id, name: 'Untitled pipeline' }));
    expect(pipeline.id).not.toBe(draft.id);
    expect(history.past.map((entry) => entry.label)).toEqual(['New pipeline']);
    expect(notifications().getByRole('listitem')).toHaveTextContent('Started a blank pipeline');

    await user.click(await findUndoAction());
    expect(store.getState().pipeline).toBe(draft);
  });

  it('leaves a pipeline that is blank already as it is', async () => {
    const blank = createEmptyPipeline({ id: 'draft', name: 'Untitled pipeline' });
    const { store, choose } = renderMenu(blank);

    await choose('Blank pipeline');

    expect(store.getState().pipeline).toBe(blank);
    expect(store.getState().history).toBe(EMPTY_HISTORY);
  });

  it('opens from the keyboard and returns focus to its button', async () => {
    const { store, user } = renderMenu();

    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Blank pipeline' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');

    expect(store.getState().pipeline.name).toBe('Ask a question');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toHaveFocus();
  });
});
