import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type Node, ReactFlow } from '@xyflow/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from '@/shared/ui/button';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { Dialog, DialogContent, DialogTrigger } from './Dialog';

function renderWithProvider(ui: ReactNode) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

function RenameDialog({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>Rename</Button>
      </DialogTrigger>
      <DialogContent title="Rename pipeline" description="The name is used for exported files.">
        <label>
          Name <input defaultValue="Untitled pipeline" />
        </label>
      </DialogContent>
    </Dialog>
  );
}

describe('Dialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is named by its title and described by its description', () => {
    renderWithProvider(
      <Dialog defaultOpen>
        <DialogContent title="Import failed" description="The file is not a pipeline." />
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Import failed' })).toHaveAccessibleDescription(
      'The file is not a pipeline.',
    );
  });

  it('has no description when none is given, and logs nothing', () => {
    const consoleError = vi.spyOn(console, 'error');
    const consoleWarn = vi.spyOn(console, 'warn');
    renderWithProvider(
      <Dialog defaultOpen>
        <DialogContent title="Keyboard shortcuts">
          <p>Ctrl + Z: Undo</p>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).not.toHaveAttribute('aria-describedby');
    expect(dialog).toHaveAccessibleDescription('');
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('opens from its trigger, focuses its first control and returns focus on Escape', async () => {
    const user = userEvent.setup();
    renderWithProvider(<RenameDialog />);

    await user.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByRole('dialog', { name: 'Rename pipeline' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename' })).toHaveFocus();
  });

  it('keeps Tab inside while open', async () => {
    const user = userEvent.setup();
    renderWithProvider(<RenameDialog />);
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('focuses the panel when it has no controls besides Close', async () => {
    const user = userEvent.setup();
    renderWithProvider(
      <Dialog defaultOpen>
        <DialogContent title="Keyboard shortcuts">
          <p>Ctrl + Z: Undo</p>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveFocus();
    // The Close tooltip appears only when the user moves to the button.
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('closes with the Close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProvider(<RenameDialog onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  describe('on top of the canvas', () => {
    const SELECTED_NODE: Node = {
      id: 'a',
      position: { x: 0, y: 0 },
      data: { label: 'A' },
      selected: true,
    };

    function renderOverCanvas(dialog: ReactNode) {
      const onDelete = vi.fn();
      renderWithProvider(
        <>
          <div style={{ width: 800, height: 600 }}>
            <ReactFlow
              defaultNodes={[SELECTED_NODE]}
              deleteKeyCode={['Delete', 'Backspace']}
              onDelete={onDelete}
            />
          </div>
          {dialog}
        </>,
      );
      return { onDelete, user: userEvent.setup() };
    }

    it('lets Delete outside a dialog delete the canvas selection', async () => {
      const { onDelete, user } = renderOverCanvas(null);

      await user.keyboard('{Delete}');

      // Checked right after the key, like the negative case below.
      expect(onDelete).toHaveBeenCalledWith(
        expect.objectContaining({ nodes: [expect.objectContaining({ id: 'a' })] }),
      );
    });

    it('keeps Delete and Backspace pressed inside the dialog away from the canvas', async () => {
      const { onDelete, user } = renderOverCanvas(
        <Dialog defaultOpen>
          <DialogContent title="Keyboard shortcuts">
            <p>Delete removes the selection.</p>
          </DialogContent>
        </Dialog>,
      );
      // Neither the panel nor a button is a text field, which React Flow would skip by itself.
      expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveFocus();
      await user.keyboard('{Delete}{Backspace}');
      await user.tab();
      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
      await user.keyboard('{Delete}{Backspace}');

      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});
