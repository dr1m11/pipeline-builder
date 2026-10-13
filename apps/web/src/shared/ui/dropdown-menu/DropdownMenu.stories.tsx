import type { Meta, StoryObj } from '@storybook/react-vite';
import { Braces, ChevronDown, FilePlus, MessageCircleQuestionMark, Split } from 'lucide-react';
import { expect, fn, screen, waitFor } from 'storybook/test';

import { Button } from '@/shared/ui/button';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './DropdownMenu';

/** The story's controls edit the first item, "Blank pipeline". */
const meta = {
  title: 'shared/ui/DropdownMenu',
  component: DropdownMenuItem,
  subcomponents: {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuSeparator,
    DropdownMenuLabel,
  },
  args: {
    children: 'Blank pipeline',
    icon: <FilePlus />,
    hint: 'Ctrl+Alt+N',
    onSelect: fn(),
  },
  render: (args) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          New
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem {...args} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Templates</DropdownMenuLabel>
        <DropdownMenuItem icon={<MessageCircleQuestionMark />}>Ask a question</DropdownMenuItem>
        <DropdownMenuItem icon={<Split />}>Route by sentiment</DropdownMenuItem>
        <DropdownMenuItem icon={<Braces />} disabled>
          Extract a JSON field
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
} satisfies Meta<typeof DropdownMenuItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Items with icons, a hint, a separator, a group label and a disabled item. */
export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'New' }));

    // The menu is portalled to <body>, outside the story canvas.
    const menu = await screen.findByRole('menu');
    await expect(menu).toBeVisible();
    await expect(
      screen.getByRole('menuitem', { name: 'Blank pipeline' }),
    ).toHaveAccessibleDescription('Ctrl+Alt+N');
    await expect(screen.getByRole('menuitem', { name: 'Extract a JSON field' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  },
};

/** Arrow keys move between items and skip disabled ones; Enter runs the focused item. */
export const KeyboardNavigation: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const trigger = canvas.getByRole('button', { name: 'New' });
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    const first = await screen.findByRole('menuitem', { name: 'Blank pipeline' });
    await waitFor(() => expect(first).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await expect(screen.getByRole('menuitem', { name: 'Route by sentiment' })).toHaveFocus();
    // The last item is disabled, so focus stays.
    await userEvent.keyboard('{ArrowDown}');
    await expect(screen.getByRole('menuitem', { name: 'Route by sentiment' })).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}{ArrowUp}{Enter}');
    await expect(args.onSelect).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};
