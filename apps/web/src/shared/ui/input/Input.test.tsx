import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Input } from './Input';

describe('Input', () => {
  it('is a text box by default', () => {
    render(<Input aria-label="Model" />);
    expect(screen.getByRole('textbox', { name: 'Model' })).toHaveAttribute('type', 'text');
  });

  it('works uncontrolled through a ref and change events, as register() uses it', async () => {
    const user = userEvent.setup();
    const ref = vi.fn<(element: HTMLInputElement | null) => void>();
    const onChange = vi.fn();
    render(<Input aria-label="Model" name="model" ref={ref} onChange={onChange} />);

    const input = screen.getByRole('textbox', { name: 'Model' });
    expect(ref).toHaveBeenCalledWith(input);
    await user.type(input, 'gpt');
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(input).toHaveValue('gpt');
    expect(input).toHaveAttribute('name', 'model');
  });

  it('takes numbers', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Temperature" type="number" step={0.1} />);

    const input = screen.getByRole('spinbutton', { name: 'Temperature' });
    await user.type(input, '0.5');
    expect(input).toHaveValue(0.5);
  });

  it('ignores typing when disabled', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Model" disabled />);

    const input = screen.getByRole('textbox', { name: 'Model' });
    await user.type(input, 'gpt');
    expect(input).toHaveValue('');
  });

  it('merges a custom className', () => {
    render(<Input aria-label="Model" className="font-mono" />);
    expect(screen.getByRole('textbox', { name: 'Model' })).toHaveClass('font-mono');
  });
});
