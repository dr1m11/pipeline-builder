import {
  addNode,
  createEmptyPipeline,
  findNode,
  getNodePorts,
  NODE_KINDS,
  type NodeKind,
} from '@pipeline-builder/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createPipelineStore, PipelineStoreProvider, usePipelineStore } from '@/entities/pipeline';

import { NodeProperties } from './NodeProperties';

/** The properties form of the node with `id`, following it in the store as the editor does. */
function Harness({ id }: { id: string }) {
  const node = usePipelineStore((state) => findNode(state.pipeline, id));
  return node === undefined ? null : <NodeProperties key={node.id} node={node} />;
}

/** Renders the form of a new `kind` node with id "n". */
function renderForm(kind: NodeKind) {
  const { pipeline } = addNode(createEmptyPipeline({ id: 'p', name: 'Test' }), {
    kind,
    id: 'n',
    position: { x: 0, y: 0 },
  });
  const store = createPipelineStore(pipeline);
  render(
    <PipelineStoreProvider store={store}>
      <Harness id="n" />
    </PipelineStoreProvider>,
  );
  const node = () => {
    const current = findNode(store.getState().pipeline, 'n');
    if (current === undefined) throw new Error('The node is gone');
    return current;
  };
  return { store, node, user: userEvent.setup() };
}

describe('NodeProperties', () => {
  it.each(NODE_KINDS)('labels the name and every field of a "%s" node', (kind) => {
    renderForm(kind);

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    const controls = (['textbox', 'combobox', 'spinbutton'] as const).flatMap((role) =>
      screen.queryAllByRole(role),
    );
    expect(controls.length).toBeGreaterThan(1);
    for (const control of controls) expect(control).toHaveAccessibleName();
  });

  it('shows the fields of a node in its schema order with their values', () => {
    renderForm('llm-call');

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('LLM Call 1');
    const provider = screen.getByRole('combobox', { name: 'Provider' });
    expect(provider).toHaveDisplayValue('Mock (no API key)');
    expect(provider).toHaveAccessibleDescription(
      'The mock provider streams sample text and needs no API key.',
    );
    const model = screen.getByRole('textbox', { name: 'Model' });
    expect(provider.compareDocumentPosition(model)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(model).toHaveValue('mock');
    expect(screen.getByRole('spinbutton', { name: 'Temperature' })).toHaveValue(0.7);
    expect(screen.getByRole('spinbutton', { name: 'Max tokens' })).toHaveValue(512);
  });

  it('applies a template as it is typed, so the ports follow it', async () => {
    const { node, user } = renderForm('prompt');
    const template = screen.getByRole('textbox', { name: 'Template' });

    await user.clear(template);
    await user.paste('Translate {{text}} into {{language}}');

    expect(node().data).toEqual({ template: 'Translate {{text}} into {{language}}' });
    expect(getNodePorts(node()).inputs.map((port) => port.id)).toEqual(['text', 'language']);
    expect(template).toHaveValue('Translate {{text}} into {{language}}');
  });

  it('shows the errors a node already has', async () => {
    renderForm('input');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Value' })).toHaveAccessibleDescription(
        /Required/,
      );
    });
    expect(screen.getByRole('textbox', { name: 'Value' })).toBeInvalid();
  });

  it('keeps a value that breaks a rule and says which rule', async () => {
    const { node, user } = renderForm('llm-call');
    const temperature = screen.getByRole('spinbutton', { name: 'Temperature' });

    await user.clear(temperature);
    await user.type(temperature, '5');

    expect(node().data).toMatchObject({ temperature: 5 });
    await waitFor(() => {
      expect(temperature).toHaveAccessibleDescription(/Must be from 0 to 2/);
    });
  });

  it('keeps the pipeline value while a number field is empty', async () => {
    const { node, user } = renderForm('llm-call');
    const maxTokens = screen.getByRole('spinbutton', { name: 'Max tokens' });

    await user.clear(maxTokens);

    expect(node().data).toMatchObject({ maxTokens: 512 });
    await waitFor(() => {
      expect(maxTokens).toHaveAccessibleDescription(/Must be a number/);
    });
  });

  it('renames the node with a trimmed name and leaves the typing alone', async () => {
    const { node, user } = renderForm('prompt');
    const name = screen.getByRole('textbox', { name: 'Name' });

    await user.clear(name);
    await user.type(name, 'Summarize ');

    expect(node().label).toBe('Summarize');
    expect(name).toHaveValue('Summarize ');
  });

  it('keeps the old name while the name is blank and says it is required', async () => {
    const { node, user } = renderForm('prompt');
    const name = screen.getByRole('textbox', { name: 'Name' });

    await user.clear(name);

    expect(node().label).toBe('Prompt 1');
    expect(name).toHaveValue('');
    await waitFor(() => {
      expect(name).toHaveAccessibleDescription(/Required/);
    });
  });

  it('shows a field once it applies, with its error', async () => {
    const { node, user } = renderForm('transform');
    expect(screen.queryByRole('textbox', { name: 'Field path' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Operation' }), 'Get field');

    expect(node().data).toMatchObject({ operation: 'get-field' });
    const path = await screen.findByRole('textbox', { name: 'Field path' });
    await waitFor(() => {
      expect(path).toHaveAccessibleDescription(/Required/);
    });
  });

  it('shows changes made elsewhere, such as an undo', async () => {
    const { store } = renderForm('prompt');

    store.getState().updateNodeData('n', { template: 'Tell a joke' });
    store.getState().renameNode('n', 'Jokes');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Template' })).toHaveValue('Tell a joke');
    });
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Jokes');
  });

  it('focuses a requested field once and reports it', async () => {
    const { pipeline } = addNode(createEmptyPipeline({ id: 'p', name: 'Test' }), {
      kind: 'llm-call',
      id: 'n',
      position: { x: 0, y: 0 },
    });
    const node = findNode(pipeline, 'n');
    if (node === undefined) throw new Error('The node is missing');
    const onFieldFocused = vi.fn();

    render(
      <PipelineStoreProvider store={createPipelineStore(pipeline)}>
        <NodeProperties node={node} focusField="temperature" onFieldFocused={onFieldFocused} />
      </PipelineStoreProvider>,
    );

    // React Hook Form focuses on the next task.
    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: 'Temperature' })).toHaveFocus();
    });
    expect(onFieldFocused).toHaveBeenCalledOnce();
  });
});
