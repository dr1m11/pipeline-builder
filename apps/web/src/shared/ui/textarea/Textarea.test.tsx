import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('takes several lines of text', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Template" />);

    const textarea = screen.getByRole('textbox', { name: 'Template' });
    await user.type(textarea, 'Hello{Enter}world');
    expect(textarea).toHaveValue('Hello\nworld');
  });

  it('works uncontrolled through a ref and change events, as register() uses it', async () => {
    const user = userEvent.setup();
    const ref = vi.fn<(element: HTMLTextAreaElement | null) => void>();
    const onChange = vi.fn();
    render(<Textarea aria-label="Template" ref={ref} onChange={onChange} />);

    const textarea = screen.getByRole('textbox', { name: 'Template' });
    expect(ref).toHaveBeenCalledWith(textarea);
    await user.type(textarea, 'Hi');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('ignores typing when disabled', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Template" disabled />);

    const textarea = screen.getByRole('textbox', { name: 'Template' });
    await user.type(textarea, 'Hi');
    expect(textarea).toHaveValue('');
  });
});
