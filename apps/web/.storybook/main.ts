import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['./docs/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-vitest',
    // Serves an MCP endpoint at /mcp for coding agents (see .mcp.json).
    '@storybook/addon-mcp',
  ],
  features: {
    // Component metadata for the MCP docs tools.
    componentsManifest: true,
  },
  core: {
    disableTelemetry: true,
  },
};

export default config;
