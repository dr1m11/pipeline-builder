import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** `wrangler dev` of apps/proxy, which serves the API (`pnpm dev` starts both). */
const PROXY_ORIGIN = 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Reads the `@/*` alias from tsconfig.app.json, so paths are declared once.
    tsconfigPaths: true,
  },
  build: {
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same origin as in production, where one Worker serves the SPA and /api/*.
    // `vite preview` inherits this proxy.
    proxy: { '/api/': PROXY_ORIGIN },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
