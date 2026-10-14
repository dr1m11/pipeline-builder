import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox, type CheckboxProps } from './Checkbox';

function LabelledCheckbox(props: CheckboxProps) {
  return (
    <>
      <Checkbox id="remember" {...props} />
      <label htmlFor="remember">Remember on this device</label>
    </>
  );
}

const checkbox = () => screen.getByRole('checkbox', { name: 'Remember on this device' });

describe('Checkbox', () => {
  it('is named by its label and starts unchecked', () => {
    render(<LabelledCheckbox />);

    expect(checkbox()).not.toBeChecked();
  });

  it('toggles on a click and reports the new state', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<LabelledCheckbox onCheckedChange={onCheckedChange} />);

    await user.click(checkbox());
    expect(checkbox()).toBeChecked();
    await user.click(checkbox());

    expect(checkbox()).not.toBeChecked();
    expect(onCheckedChange.mock.calls).toEqual([[true], [false]]);
  });

  it('toggles when its label is clicked', async () => {
    const user = userEvent.setup();
    render(<LabelledCheckbox />);

    await user.click(screen.getByText('Remember on this device'));

    expect(checkbox()).toBeChecked();
  });

  it('toggles with Space but not with Enter', async () => {
    const user = userEvent.setup();
    render(<LabelledCheckbox />);

    await user.tab();
    expect(checkbox()).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(checkbox()).not.toBeChecked();
    await user.keyboard(' ');

    expect(checkbox()).toBeChecked();
  });

  it('follows a controlled state, indeterminate included', () => {
    const { rerender } = render(<LabelledCheckbox checked onCheckedChange={vi.fn()} />);
    expect(checkbox()).toBeChecked();

    rerender(<LabelledCheckbox checked="indeterminate" onCheckedChange={vi.fn()} />);

    expect(checkbox()).toBePartiallyChecked();
  });

  it('ignores clicks when disabled', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<LabelledCheckbox disabled onCheckedChange={onCheckedChange} />);

    await user.click(checkbox());

    expect(checkbox()).toBeDisabled();
    expect(checkbox()).not.toBeChecked();
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it('merges a custom className', () => {
    render(<LabelledCheckbox className="mt-0.5" />);
    expect(checkbox()).toHaveClass('mt-0.5');
  });
});
