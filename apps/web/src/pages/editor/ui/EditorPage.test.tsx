import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EditorPage } from './EditorPage';

describe('EditorPage', () => {
  it('shows the pipeline name and the canvas region', () => {
    render(<EditorPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Untitled pipeline' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Pipeline canvas' })).toBeInTheDocument();
  });
});
