import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
// Not 8787, where `pnpm dev` runs the Worker: the tests can run while the dev servers do.
const port = 8788;
const baseURL = `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // E2E runs against what gets deployed: the Worker of apps/proxy, which serves the production
  // build of the SPA (run `pnpm build` first) with its headers, and the API on the same origin
  // (docs/adr/0012). `wrangler dev` fails when the port is taken; locally a Worker already
  // listening there is reused. It logs `Network connection lost` when a test stops a run: that is
  // the runtime reporting the client's disconnect, not a failure.
  webServer: {
    command: `pnpm exec wrangler dev --ip 127.0.0.1 --port ${String(port)}`,
    cwd: fileURLToPath(new URL('../proxy', import.meta.url)),
    url: `${baseURL}/api/health`,
    reuseExistingServer: !isCI,
    timeout: 60_000,
    // No usage data from test runs.
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
