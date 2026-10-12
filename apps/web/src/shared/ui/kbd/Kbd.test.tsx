import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Kbd } from './Kbd';

describe('Kbd', () => {
  it('renders a semantic <kbd> element', () => {
    render(
      <p>
        Press <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd> to undo
      </p>,
    );

    const keys = screen.getAllByText(/^(Ctrl|Z)$/);
    expect(keys.map((key) => key.tagName)).toEqual(['KBD', 'KBD']);
    expect(screen.getByText(/to undo/)).toHaveTextContent('Press Ctrl + Z to undo');
  });
});
