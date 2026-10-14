import type { Meta, StoryObj } from '@storybook/react-vite';
import { useId } from 'react';
import { expect, fn } from 'storybook/test';

import { Checkbox } from './Checkbox';

const meta = {
  title: 'shared/ui/Checkbox',
  component: Checkbox,
  args: { onCheckedChange: fn() },
  // A checkbox has no text of its own: a label names it, and a click on the label toggles it.
  render: function LabelledCheckbox(args) {
    const id = useId();
    return (
      <div className="flex items-center gap-2">
        <Checkbox {...args} id={id} />
        <label htmlFor={id} className="text-sm">
          Remember on this device
        </label>
      </div>
    );
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Space toggles the focused checkbox; Enter does not, as in the WAI-ARIA pattern. */
export const Unchecked: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const checkbox = canvas.getByRole('checkbox', { name: 'Remember on this device' });
    await userEvent.tab();
    await expect(checkbox).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    await expect(checkbox).not.toBeChecked();
    await userEvent.keyboard(' ');
    await expect(checkbox).toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
  },
};

export const Checked: Story = {
  args: { defaultChecked: true },
  play: async ({ args, canvas, userEvent }) => {
    const checkbox = canvas.getByRole('checkbox', { name: 'Remember on this device' });
    await expect(checkbox).toBeChecked();

    await userEvent.click(canvas.getByText('Remember on this device'));
    await expect(checkbox).not.toBeChecked();
    await expect(args.onCheckedChange).toHaveBeenCalledWith(false);
  },
};

export const Indeterminate: Story = {
  args: { checked: 'indeterminate' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('checkbox', { name: 'Remember on this device' }),
    ).toBePartiallyChecked();
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultChecked: true },
  play: async ({ args, canvas, userEvent }) => {
    const checkbox = canvas.getByRole('checkbox', { name: 'Remember on this device' });
    await expect(checkbox).toBeDisabled();
    await userEvent.click(checkbox);
    await expect(checkbox).toBeChecked();
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};
