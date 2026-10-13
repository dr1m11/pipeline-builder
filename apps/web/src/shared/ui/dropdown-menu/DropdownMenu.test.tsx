import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlow } from '@xyflow/react';
import { FilePlus } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/shared/ui/button';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';

function NewMenu({ onSelect = vi.fn() }: { onSelect?: (item: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>New</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          icon={<FilePlus />}
          hint="Ctrl+N"
          onSelect={() => {
            onSelect('blank');
          }}
        >
          Blank pipeline
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Templates</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            onSelect('ask');
          }}
        >
          Ask a question
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled
          onSelect={() => {
            onSelect('soon');
          }}
        >
          Coming soon
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onSelect('route');
          }}
        >
          Route by sentiment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('opens from the keyboard, moves with the arrow keys and runs an item with Enter', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NewMenu onSelect={onSelect} />);

    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Blank pipeline' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Ask a question' })).toHaveFocus();
    // The disabled item is skipped.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Route by sentiment' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('route');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toHaveFocus();
  });

  it('opens on click and closes on Escape without running an item', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<NewMenu onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Not modal: the trigger stays in the accessibility tree and reports the open menu.
    expect(screen.getByRole('button', { name: 'New', expanded: true })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('names an item by its text and describes it by its hint', async () => {
    const user = userEvent.setup();
    render(<NewMenu />);
    await user.click(screen.getByRole('button', { name: 'New' }));

    expect(screen.getByRole('menuitem', { name: 'Blank pipeline' })).toHaveAccessibleDescription(
      'Ctrl+N',
    );
    expect(screen.getByRole('menuitem', { name: 'Coming soon' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByText('Templates')).toBeInTheDocument();
  });

  it('keeps Delete and Backspace pressed in the menu away from the canvas', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <>
        <div style={{ width: 800, height: 600 }}>
          <ReactFlow
            defaultNodes={[{ id: 'a', position: { x: 0, y: 0 }, data: {}, selected: true }]}
            deleteKeyCode={['Delete', 'Backspace']}
            onDelete={onDelete}
          />
        </div>
        <NewMenu />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'New' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Blank pipeline' })).toHaveFocus();
    await user.keyboard('{Delete}{Backspace}');

    // Dialog.test.tsx shows that the same key outside a .nokey element deletes by this point.
    expect(onDelete).not.toHaveBeenCalled();
  });
});
