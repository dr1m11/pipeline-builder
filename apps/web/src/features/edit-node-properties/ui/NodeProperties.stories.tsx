import { addNode, createEmptyPipeline, findNode, type NodeKind } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor } from 'storybook/test';

import { createPipelineStore, PipelineStoreProvider, usePipelineStore } from '@/entities/pipeline';

import { NodeProperties } from './NodeProperties';

/** The form of the node "n", following it in the store as the editor does. */
function Form() {
  const node = usePipelineStore((state) => findNode(state.pipeline, 'n'));
  return node === undefined ? null : <NodeProperties key={node.id} node={node} />;
}

/** The properties form of a new `kind` node, in a sidebar-wide column. */
function NodePropertiesPreview({ kind }: { kind: NodeKind }) {
  const store = useMemo(() => {
    const empty = createEmptyPipeline({ id: 'draft', name: 'Story' });
    return createPipelineStore(
      addNode(empty, { kind, id: 'n', position: { x: 0, y: 0 } }).pipeline,
    );
  }, [kind]);
  return (
    <PipelineStoreProvider store={store}>
      <div className="w-80 rounded-lg border border-border bg-surface p-3">
        <Form />
      </div>
    </PipelineStoreProvider>
  );
}

const meta = {
  title: 'features/NodeProperties',
  component: NodePropertiesPreview,
  args: { kind: 'prompt' },
} satisfies Meta<typeof NodePropertiesPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prompt: Story = {
  play: async ({ canvas, userEvent }) => {
    const name = canvas.getByRole('textbox', { name: 'Name' });
    await userEvent.click(name);
    await userEvent.keyboard('{Control>}a{/Control}Summarize');
    await userEvent.tab();

    await expect(name).toHaveValue('Summarize');
    await expect(canvas.getByRole('textbox', { name: 'Template' })).toHaveFocus();
  },
};

export const InputWithErrors: Story = {
  args: { kind: 'input' },
  play: async ({ canvas }) => {
    await waitFor(() =>
      expect(canvas.getByRole('textbox', { name: 'Value' })).toHaveAccessibleDescription(
        /Required/,
      ),
    );
  },
};

export const LlmCall: Story = {
  args: { kind: 'llm-call' },
  play: async ({ canvas, userEvent }) => {
    const provider = canvas.getByRole('combobox', { name: 'Provider' });
    await expect(provider).toHaveDisplayValue('Mock (no API key)');
    await expect(provider).toHaveAccessibleDescription(/sent only to this app’s own proxy/);

    // The default model follows the provider.
    await userEvent.selectOptions(provider, 'Anthropic (your API key)');
    await expect(canvas.getByRole('textbox', { name: 'Model' })).toHaveValue('claude-haiku-5-5');

    const temperature = canvas.getByRole('spinbutton', { name: 'Temperature' });
    await userEvent.clear(temperature);
    await userEvent.type(temperature, '5');

    await waitFor(() => expect(temperature).toHaveAccessibleDescription(/Must be from 0 to 2/));
    await expect(temperature).toBeInvalid();
  },
};

export const Transform: Story = {
  args: { kind: 'transform' },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole('textbox', { name: 'Field path' })).not.toBeInTheDocument();

    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Operation' }), 'Get field');

    const path = await canvas.findByRole('textbox', { name: 'Field path' });
    await userEvent.type(path, 'user.name');
    await waitFor(() => expect(path).not.toBeInvalid());
  },
};

export const Condition: Story = {
  args: { kind: 'condition' },
};

export const Output: Story = {
  args: { kind: 'output' },
};
