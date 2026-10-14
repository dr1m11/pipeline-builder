import type { LlmProvider } from '@pipeline-builder/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, screen, waitFor, within } from 'storybook/test';

import { getApiKey, isApiKeyRemembered, saveApiKey } from '@/entities/api-key';

import { ApiKeysButton } from './ApiKeysButton';
import { ApiKeysDialog } from './ApiKeysDialog';

interface ApiKeysDialogPreviewProps {
  /** Provider whose field takes focus, as when a run asks for a missing key. */
  provider?: LlmProvider;
  /** Whether the dialog is open when the story starts. */
  defaultOpen?: boolean;
}

/** The dialog as the editor wires it: the page owns the open state, the header button opens it. */
function ApiKeysDialogPreview({ provider, defaultOpen = false }: ApiKeysDialogPreviewProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <ApiKeysButton
        onClick={() => {
          setOpen(true);
        }}
      />
      <ApiKeysDialog open={open} onOpenChange={setOpen} provider={provider} />
    </>
  );
}

const meta = {
  title: 'features/ApiKeysDialog',
  component: ApiKeysDialogPreview,
} satisfies Meta<typeof ApiKeysDialogPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Example keys; the preview clears every key before each story. */
function saveExampleKeys() {
  saveApiKey('anthropic', 'sk-ant-example-key', { remember: true });
  saveApiKey('openai', 'sk-proj-example-key', { remember: true });
}

/** No key is saved yet: a key typed and saved with Remember is kept on this device. */
export const Empty: Story = {
  play: async ({ canvas, userEvent }) => {
    const button = canvas.getByRole('button', { name: 'API keys' });
    await userEvent.click(button);

    // The dialog is portalled to <body>, outside the story canvas.
    const dialog = await screen.findByRole('dialog', { name: 'API keys' });
    const anthropic = within(dialog).getByLabelText('Anthropic');
    await waitFor(() => expect(anthropic).toHaveFocus());
    await expect(anthropic).toHaveValue('');
    await expect(within(dialog).getByLabelText('OpenAI')).toHaveValue('');
    await expect(
      within(dialog).getByRole('button', { name: 'Clear Anthropic key' }),
    ).toBeDisabled();

    await userEvent.keyboard('sk-ant-new-key');
    await userEvent.click(
      within(dialog).getByRole('checkbox', { name: 'Remember on this device' }),
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(button).toHaveFocus();
    await expect(getApiKey('anthropic')).toBe('sk-ant-new-key');
    await expect(isApiKeyRemembered('anthropic')).toBe(true);
  },
};

/** Saved keys fill their fields, hidden until shown; Clear forgets one key at once. */
export const WithKeysSaved: Story = {
  beforeEach: saveExampleKeys,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'API keys' }));

    const dialog = await screen.findByRole('dialog', { name: 'API keys' });
    const anthropic = within(dialog).getByLabelText('Anthropic');
    await expect(anthropic).toHaveAttribute('type', 'password');
    await expect(anthropic).toHaveValue('sk-ant-example-key');
    await expect(
      within(dialog).getByRole('checkbox', { name: 'Remember on this device' }),
    ).toBeChecked();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Show Anthropic key' }));
    await expect(within(dialog).getByRole('textbox', { name: 'Anthropic' })).toHaveValue(
      'sk-ant-example-key',
    );

    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear OpenAI key' }));
    await expect(within(dialog).getByLabelText('OpenAI')).toHaveValue('');
    await expect(within(dialog).getByRole('status')).toHaveTextContent('OpenAI key cleared.');
    await expect(getApiKey('openai')).toBeNull();
  },
};

/** Opened for one provider, as a run that needs its key opens it: its field has focus. */
export const OpenedForProvider: Story = {
  args: { provider: 'openai', defaultOpen: true },
  play: async () => {
    const dialog = await screen.findByRole('dialog', { name: 'API keys' });
    await waitFor(() => expect(within(dialog).getByLabelText('OpenAI')).toHaveFocus());
  },
};

/**
 * The dialog with keys shown in the dark theme, so that its accessibility is checked there too.
 * The theme is the toolbar's global, pinned for this story.
 */
export const DarkTheme: Story = {
  args: { defaultOpen: true },
  globals: { theme: 'dark' },
  // The docs page renders every story at once, under the theme picked in the toolbar.
  tags: ['!autodocs'],
  beforeEach: saveExampleKeys,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole('dialog', { name: 'API keys' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Show OpenAI key' }));

    await expect(within(dialog).getByRole('textbox', { name: 'OpenAI' })).toBeVisible();
    await expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  },
};
