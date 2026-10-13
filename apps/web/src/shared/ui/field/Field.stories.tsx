import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect } from 'storybook/test';

import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

import { Field } from './Field';

const meta = {
  title: 'shared/ui/Field',
  component: Field,
  args: { label: 'Model', children: <Input /> },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithInput: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const input = canvas.getByRole('textbox', { name: 'Model' });
    await expect(input).toHaveFocus();
    await userEvent.keyboard('mock');
    await expect(input).toHaveValue('mock');
  },
};

export const WithDescription: Story = {
  args: {
    label: 'Template',
    description: 'Every {{variable}} becomes an input of the node.',
    children: <Textarea defaultValue="Answer the question: {{question}}" />,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('textbox', { name: 'Template' })).toHaveAccessibleDescription(
      'Every {{variable}} becomes an input of the node.',
    );
  },
};

export const WithError: Story = {
  args: {
    label: 'Temperature',
    description: 'From 0 (focused) to 2 (varied).',
    error: 'Must be from 0 to 2',
    children: <Input type="number" step={0.1} defaultValue={5} />,
  },
  play: async ({ canvas }) => {
    const input = canvas.getByRole('spinbutton', { name: 'Temperature' });
    await expect(input).toBeInvalid();
    await expect(input).toHaveAccessibleDescription(
      'From 0 (focused) to 2 (varied). Must be from 0 to 2',
    );
  },
};

export const WithSelect: Story = {
  args: {
    label: 'Operation',
    children: (
      <Select defaultValue="parse-json">
        <option value="parse-json">Parse JSON</option>
        <option value="stringify">Stringify JSON</option>
        <option value="trim">Trim text</option>
        <option value="get-field">Get field</option>
      </Select>
    ),
  },
  play: async ({ canvas, userEvent }) => {
    const select = canvas.getByRole('combobox', { name: 'Operation' });
    await userEvent.selectOptions(select, 'Trim text');
    await expect(select).toHaveValue('trim');
  },
};

/** The error appears while typing, in a live region that was there from the start. */
export const ValidatedWhileTyping: Story = {
  render: function ValidatedWhileTyping() {
    const [value, setValue] = useState('mock');
    return (
      <Field label="Model" error={value.trim() === '' ? 'Required' : undefined}>
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </Field>
    );
  },
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('textbox', { name: 'Model' });
    await userEvent.clear(input);
    await expect(input).toBeInvalid();
    await expect(input).toHaveAccessibleDescription('Required');
    await userEvent.type(input, 'gpt');
    await expect(input).toBeValid();
  },
};
