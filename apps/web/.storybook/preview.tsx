import '../src/app/styles/index.css';

import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';

import { API_KEY_PROVIDERS, clearApiKey } from '../src/entities/api-key';
import { DRAFT_STORAGE_KEY, UNREADABLE_DRAFT_STORAGE_KEY } from '../src/entities/pipeline';
import { ToastProvider } from '../src/shared/ui/toast';
import { TooltipProvider } from '../src/shared/ui/tooltip';

const preview: Preview = {
  tags: ['autodocs'],
  // Stories share the browser's storage: each one starts without an autosaved draft or API keys.
  beforeEach: () => {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    window.localStorage.removeItem(UNREADABLE_DRAFT_STORAGE_KEY);
    for (const provider of API_KEY_PROVIDERS) clearApiKey(provider);
  },
  parameters: {
    layout: 'centered',
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // Accessibility violations fail story tests (Vitest) instead of only showing in the panel.
    a11y: { test: 'error' },
  },
  decorators: [
    // The same providers as the app, so any story can use tooltips and `useToast`.
    (Story) => (
      <TooltipProvider delayDuration={0}>
        <ToastProvider>
          <Story />
        </ToastProvider>
      </TooltipProvider>
    ),
    withThemeByDataAttribute({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
      attributeName: 'data-theme',
    }),
  ],
};

export default preview;
