import { render, screen } from '@testing-library/react';
import { CircleAlert } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { Badge } from './Badge';

describe('Badge', () => {
  it('shows its content as plain text, not as a control', () => {
    render(
      <p>
        Problems{' '}
        <Badge tone="danger">
          <CircleAlert aria-hidden />2<span className="sr-only"> errors</span>
        </Badge>
      </p>,
    );

    expect(screen.getByText('Problems', { exact: false })).toHaveTextContent('Problems 2 errors');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('merges a custom className', () => {
    render(<Badge className="ml-auto">3</Badge>);
    expect(screen.getByText('3')).toHaveClass('ml-auto');
  });
});
