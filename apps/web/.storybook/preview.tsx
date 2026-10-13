import '../src/app/styles/index.css';

import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Preview } from '@storybook/react-vite';

import { ToastProvider } from '../src/shared/ui/toast';
import { TooltipProvider } from '../src/shared/ui/tooltip';

const preview: Preview = {
  tags: ['autodocs'],
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
