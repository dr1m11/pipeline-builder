import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from './Select';

function OperationSelect(props: Parameters<typeof Select>[0]) {
  return (
    <Select aria-label="Operation" {...props}>
      <option value="parse-json">Parse JSON</option>
      <option value="trim">Trim text</option>
    </Select>
  );
}

describe('Select', () => {
  it('offers its options and changes the value when one is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OperationSelect onChange={onChange} />);

    const select = screen.getByRole('combobox', { name: 'Operation' });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Parse JSON',
      'Trim text',
    ]);
    await user.selectOptions(select, 'Trim text');
    expect(select).toHaveValue('trim');
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('passes the ref to the native select, as register() uses it', () => {
    const ref = vi.fn<(element: HTMLSelectElement | null) => void>();
    render(<OperationSelect ref={ref} />);
    expect(ref).toHaveBeenCalledWith(screen.getByRole('combobox', { name: 'Operation' }));
  });

  it('can be disabled', () => {
    render(<OperationSelect disabled />);
    expect(screen.getByRole('combobox', { name: 'Operation' })).toBeDisabled();
  });
});
