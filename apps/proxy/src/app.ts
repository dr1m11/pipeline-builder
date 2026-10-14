import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';

import { apiError } from './api-error';
import type { Bindings } from './bindings';
import { createLlmStreamHandler, limitRequestBody } from './llm-stream';
import type { Providers } from './providers/provider';

export interface AppOptions {
  /** Providers the stream endpoint can use, by id. */
  readonly providers: Providers;
}

/**
 * The Worker's app. The API lives under `/api/*`; any other request that reaches the Worker goes
 * to the SPA's static assets. API responses set their own security headers (`_headers` covers only
 * assets) and are never cached. Nothing here logs request headers or bodies: the `Authorization`
 * header carries the user's API key.
 */
export function createApp({ providers }: AppOptions): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();

  app.use(
    '/api/*',
    secureHeaders({
      // JSON and event streams only: nothing to load, run or frame.
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      xFrameOptions: 'DENY',
    }),
    async (c, next) => {
      await next();
      c.res.headers.set('Cache-Control', 'no-store');
    },
  );

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.post('/api/llm/stream', limitRequestBody, createLlmStreamHandler(providers));
  app.all('/api/*', (c) => apiError(c, 404, 'bad-request', 'There is no such API endpoint'));

  app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

  app.onError((error, c) => {
    // The name only: a message can quote the request.
    console.error(`Unhandled ${error.name} in ${c.req.method} ${c.req.path}`);
    return apiError(c, 500, 'upstream-error', 'The proxy failed to handle the request');
  });

  return app;
}
