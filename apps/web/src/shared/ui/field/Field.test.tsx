import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

import { Field } from './Field';

describe('Field', () => {
  it('names its control after the label', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Model">
        <Input />
      </Field>,
    );

    await user.click(screen.getByText('Model'));
    expect(screen.getByRole('textbox', { name: 'Model' })).toHaveFocus();
  });

  it('describes the control with its hint', () => {
    render(
      <Field label="Template" description="Every {{variable}} becomes an input.">
        <Textarea />
      </Field>,
    );

    const control = screen.getByRole('textbox', { name: 'Template' });
    expect(control).toHaveAccessibleDescription('Every {{variable}} becomes an input.');
    expect(control).not.toHaveAttribute('aria-invalid');
  });

  it('marks the control invalid and adds the error to its description', () => {
    render(
      <Field label="Temperature" description="From 0 to 2." error="Must be from 0 to 2">
        <Input type="number" />
      </Field>,
    );

    const control = screen.getByRole('spinbutton', { name: 'Temperature' });
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control).toHaveAccessibleDescription('From 0 to 2. Must be from 0 to 2');
  });

  it('keeps an empty live region so an error that appears later is announced', () => {
    const { rerender } = render(
      <Field label="Value">
        <Input />
      </Field>,
    );
    const control = screen.getByRole('textbox', { name: 'Value' });
    expect(control).not.toHaveAttribute('aria-describedby');

    rerender(
      <Field label="Value" error="Required">
        <Input />
      </Field>,
    );
    expect(screen.getByText('Required')).toHaveAttribute('aria-live', 'polite');
    expect(control).toHaveAccessibleDescription('Required');
  });

  it('uses the id it is given', () => {
    render(
      <Field label="Format" id="output-format">
        <Select>
          <option value="text">Plain text</option>
        </Select>
      </Field>,
    );

    expect(screen.getByRole('combobox', { name: 'Format' })).toHaveAttribute('id', 'output-format');
  });
});
