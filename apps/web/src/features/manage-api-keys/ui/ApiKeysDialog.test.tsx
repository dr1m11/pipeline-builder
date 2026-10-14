import type { LlmProvider } from '@pipeline-builder/core';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearApiKey, getApiKey, isApiKeyRemembered, saveApiKey } from '@/entities/api-key';
import { ToastProvider } from '@/shared/ui/toast';
import { TooltipProvider } from '@/shared/ui/tooltip';

import { ApiKeysButton } from './ApiKeysButton';
import { ApiKeysDialog } from './ApiKeysDialog';

/**
 * The dialog as the editor wires it: the header button opens it, and a "Run" button stands for a
 * run that asks for the key of OpenAI.
 */
function Harness() {
  const [state, setState] = useState<{ open: boolean; provider?: LlmProvider }>({ open: false });
  return (
    <TooltipProvider delayDuration={0}>
      <ToastProvider>
        <ApiKeysButton
          onClick={() => {
            setState({ open: true });
          }}
        />
        <button
          type="button"
          onClick={() => {
            setState({ open: true, provider: 'openai' });
          }}
        >
          Run
        </button>
        <ApiKeysDialog
          open={state.open}
          provider={state.provider}
          onOpenChange={(open) => {
            setState((current) => ({ ...current, open }));
          }}
        />
      </ToastProvider>
    </TooltipProvider>
  );
}

function renderDialog() {
  render(<Harness />);
  return { user: userEvent.setup() };
}

const openButton = () => screen.getByRole('button', { name: 'API keys' });
const dialog = () => screen.getByRole('dialog', { name: 'API keys' });
const field = (name: string) => within(dialog()).getByLabelText(name);
const remember = () => within(dialog()).getByRole('checkbox', { name: 'Remember on this device' });
const saveButton = () => within(dialog()).getByRole('button', { name: 'Save' });

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(openButton());
  return dialog();
}

afterEach(() => {
  vi.restoreAllMocks();
  clearApiKey('anthropic');
  clearApiKey('openai');
});

describe('ApiKeysDialog', () => {
  it('opens from its button with a hidden field for each provider that needs a key', async () => {
    const { user } = renderDialog();
    expect(openButton()).toHaveAttribute('aria-haspopup', 'dialog');

    await openDialog(user);

    expect(dialog()).toHaveAccessibleDescription(
      'Your keys stay in this browser. They are sent only to this app’s own proxy and never stored on the server.',
    );
    expect(field('Anthropic')).toHaveAttribute('type', 'password');
    expect(field('OpenAI')).toHaveAttribute('type', 'password');
    expect(within(dialog()).queryByLabelText('Mock')).not.toBeInTheDocument();
    expect(field('Anthropic')).toHaveFocus();
    expect(remember()).not.toBeChecked();
    expect(remember()).toHaveAccessibleDescription(
      'Keeps the keys after this tab is closed. Leave it off on a shared computer.',
    );
  });

  it('saves the keys for this session, closes and gives focus back to its button', async () => {
    const { user } = renderDialog();
    await openDialog(user);

    await user.type(field('Anthropic'), '  sk-ant-1 ');
    await user.click(saveButton());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(openButton()).toHaveFocus();
    expect(getApiKey('anthropic')).toBe('sk-ant-1');
    expect(isApiKeyRemembered('anthropic')).toBe(false);
    expect(window.sessionStorage.getItem('pb:api-key:anthropic')).toBe('sk-ant-1');
    expect(getApiKey('openai')).toBeNull();
  });

  it('saves with Enter in a field', async () => {
    const { user } = renderDialog();
    await openDialog(user);

    await user.type(field('OpenAI'), 'sk-oai-1{Enter}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getApiKey('openai')).toBe('sk-oai-1');
  });

  it('remembers the keys on this device when asked, and shows them next time', async () => {
    const { user } = renderDialog();
    await openDialog(user);

    await user.type(field('Anthropic'), 'sk-ant-1');
    await user.type(field('OpenAI'), 'sk-oai-1');
    await user.click(remember());
    await user.click(saveButton());

    expect(isApiKeyRemembered('anthropic')).toBe(true);
    expect(isApiKeyRemembered('openai')).toBe(true);
    expect(window.localStorage.getItem('pb:api-key:openai')).toBe('sk-oai-1');

    await openDialog(user);

    expect(field('Anthropic')).toHaveValue('sk-ant-1');
    expect(field('OpenAI')).toHaveValue('sk-oai-1');
    expect(remember()).toBeChecked();
  });

  it('moves remembered keys back to this session when Remember is turned off', async () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: true });
    const { user } = renderDialog();
    await openDialog(user);
    expect(remember()).toBeChecked();

    await user.click(remember());
    await user.click(saveButton());

    expect(getApiKey('anthropic')).toBe('sk-ant-1');
    expect(isApiKeyRemembered('anthropic')).toBe(false);
    expect(window.localStorage.getItem('pb:api-key:anthropic')).toBeNull();
  });

  it('clears a key saved with an empty field', async () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    const { user } = renderDialog();
    await openDialog(user);

    await user.clear(field('Anthropic'));
    await user.click(saveButton());

    expect(getApiKey('anthropic')).toBeNull();
  });

  it('shows and hides a key', async () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    const { user } = renderDialog();
    await openDialog(user);

    await user.click(within(dialog()).getByRole('button', { name: 'Show Anthropic key' }));

    expect(within(dialog()).getByRole('textbox', { name: 'Anthropic' })).toHaveValue('sk-ant-1');
    expect(field('OpenAI')).toHaveAttribute('type', 'password');

    await user.click(within(dialog()).getByRole('button', { name: 'Hide Anthropic key' }));

    expect(field('Anthropic')).toHaveAttribute('type', 'password');
    expect(
      within(dialog()).getByRole('button', { name: 'Show Anthropic key' }),
    ).toBeInTheDocument();
  });

  it('hides the keys again each time it opens', async () => {
    const { user } = renderDialog();
    await openDialog(user);
    await user.click(within(dialog()).getByRole('button', { name: 'Show OpenAI key' }));
    await user.keyboard('{Escape}');

    await openDialog(user);

    expect(field('OpenAI')).toHaveAttribute('type', 'password');
  });

  it('clears a saved key at once, says so and leaves the other key', async () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: true });
    saveApiKey('openai', 'sk-oai-1', { remember: true });
    const { user } = renderDialog();
    await openDialog(user);

    await user.click(within(dialog()).getByRole('button', { name: 'Clear Anthropic key' }));

    expect(getApiKey('anthropic')).toBeNull();
    expect(getApiKey('openai')).toBe('sk-oai-1');
    expect(field('Anthropic')).toHaveValue('');
    expect(field('Anthropic')).toHaveFocus();
    expect(within(dialog()).getByRole('status')).toHaveTextContent('Anthropic key cleared.');
    expect(within(dialog()).getByRole('button', { name: 'Clear Anthropic key' })).toBeDisabled();
    expect(within(dialog()).getByRole('button', { name: 'Clear OpenAI key' })).toBeEnabled();
  });

  it('offers Clear only for a saved key', async () => {
    const { user } = renderDialog();
    await openDialog(user);

    await user.type(field('Anthropic'), 'sk-ant-1');

    expect(within(dialog()).getByRole('button', { name: 'Clear Anthropic key' })).toBeDisabled();
  });

  it('drops what was typed when it closes without saving', async () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    const { user } = renderDialog();
    await openDialog(user);

    await user.type(field('Anthropic'), '-changed');
    await user.keyboard('{Escape}');

    expect(getApiKey('anthropic')).toBe('sk-ant-1');
    await openDialog(user);
    expect(field('Anthropic')).toHaveValue('sk-ant-1');
  });

  it('focuses the field of the provider it is opened for, and gives focus back after', async () => {
    const { user } = renderDialog();
    const run = screen.getByRole('button', { name: 'Run' });

    await user.click(run);

    expect(field('OpenAI')).toHaveFocus();
    await user.type(field('OpenAI'), 'sk-oai-1');
    await user.click(saveButton());

    expect(getApiKey('openai')).toBe('sk-oai-1');
    expect(run).toHaveFocus();
  });

  it('says when the browser keeps the keys only until the page reloads', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    const { user } = renderDialog();
    await openDialog(user);

    await user.type(field('Anthropic'), 'sk-ant-1');
    await user.click(saveButton());

    expect(getApiKey('anthropic')).toBe('sk-ant-1');
    const notifications = screen.getByRole('region', { name: 'Notifications (F8)' });
    await waitFor(() => {
      expect(within(notifications).getByRole('listitem')).toHaveTextContent(
        'API keys kept until the page reloads',
      );
    });
    expect(within(notifications).getByRole('listitem')).toHaveTextContent(
      'This browser doesn’t let the app store them.',
    );
  });
});
