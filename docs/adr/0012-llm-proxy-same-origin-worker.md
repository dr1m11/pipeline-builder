# 0012. LLM proxy: same-origin Worker, stream protocol, keys and limits

- Status: Accepted
- Date: 2026-10-14

## Context

Stage A5 runs pipelines, and LLM Call nodes stream their answers from a mock provider or from a real model with the user's own API key ([#80](https://github.com/dr1m11/pipeline-builder/issues/80)). The browser should not call providers directly: each has its own streaming format and CORS rules, the CSP would have to allow third-party origins, and nothing would limit how the app is used. A proxy gives the client one protocol (`LlmStreamEvent` over SSE, in core) and one place for rate limits; the mock goes through it too, so the demo exercises the same streaming path as a real model.

[ADR 0003](./0003-hosting-on-cloudflare-workers.md) put the proxy on Cloudflare Workers in `apps/proxy` and left open whether it shares the SPA's origin. The product spec adds that the key lives only in the browser, is never stored on the server and never logged, and that the proxy rate-limits requests.

## Decision

**One Worker, one origin.** `apps/proxy` is the script of the Worker that also serves the SPA. Its `wrangler.jsonc` keeps the name `pipeline-builder` (URLs do not change), serves `../web/dist` as static assets with the SPA fallback, and runs the script first only for `/api/*` (`run_worker_first: ["/api/*"]`). Other requests that reach the script (a request that is not a navigation and matches no file) go to the assets binding, so the SPA is served exactly as before. Production deploys and PR preview versions run `wrangler` from `apps/proxy` after `pnpm build`; the production smoke check also requests `/api/health`.

The API sends no CORS headers and answers a preflight with 404, so pages on other origins cannot call it from a browser. The CSP of the SPA keeps `connect-src 'self'`: the browser cannot send a key anywhere but this proxy.

**Routes.**

- `GET /api/health` answers `{ "ok": true }`.
- `POST /api/llm/stream` takes an `LlmRequest` as JSON (`Content-Type: application/json`, which a cross-site form cannot send) and checks it with `LLM_REQUEST_SCHEMA`. The body may be at most 845 KB: two prompts of `LLM_PROMPT_MAX_LENGTH` characters with a margin of 4 bytes per character, plus the other fields. Real text fits (UTF-8 takes up to 3 bytes per character), though a prompt made of characters JSON escapes, at 6 bytes each, may not.
- An error before streaming starts is an `LlmErrorResponse`, `{ "error": { "code", "message" } }`: 400 for a bad body, 413 for a body over the limit, 429 for a rate limit (404 for an unknown API path, 500 for an unexpected failure).
- Otherwise the answer is `text/event-stream`: `formatLlmStreamEvent` events, the text as `token`s and then `done`, or an `error` event once the status has been sent. Every stream ends with `done` or `error` unless the client disconnects. An `LlmError` from a provider keeps its code and message; any other error becomes `upstream-error` with a generic message, and the proxy never sends `network`, which belongs to the client.

**Providers.** A provider streams text chunks for a request and stops when its `AbortSignal` aborts; the signal aborts when the client disconnects (Hono's `stream.onAbort`), so an upstream request is cancelled too. The mock streams `mockCompletion` in `splitIntoTokens` chunks with a 40 ms pause before each (the pause is an option of `createMockProvider`; tests use 0) and needs no key. Anthropic and OpenAI answer with a `bad-request` error event ("… is not available yet") until their adapters land in [#81](https://github.com/dr1m11/pipeline-builder/issues/81).

**API keys.** The client sends the user's key only for a provider that needs one (`LLM_PROVIDER_INFO`), only in the `Authorization: Bearer <key>` header of `POST /api/llm/stream`, never in a URL or the JSON body. The proxy:

- forwards the key only to the API of the provider the request names (#81) and ignores it for the mock;
- never stores it: no KV, Durable Objects, cache or other persistence;
- never logs it: nothing logs request headers or bodies; the only log line, for an unexpected error, holds the error's name, the method and the path, and errors from upstream are not echoed unless an adapter wrote the `LlmError` message itself;
- marks every API response `Cache-Control: no-store`.

**Limits and headers.** Two rate limiting bindings, keyed by `cf-connecting-ip`: `LLM_RATE_LIMITER` (30 requests per 10 seconds) counts every LLM request, before the body is read, so bad requests count too; `REAL_PROVIDER_RATE_LIMITER` (20 per 60 seconds) also counts requests to a provider that needs a key, since those call a real model. Exceeding either gives 429 `rate-limited`. `_headers` applies only to static assets, so API responses set their own security headers with Hono's `secureHeaders` (`default-src 'none'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`).

**Local development and types.** `pnpm dev` runs Vite (port 5173) and `wrangler dev` together, and Vite forwards `/api/` to `wrangler dev` in dev and preview, so the browser sees one origin as in production. `wrangler.jsonc` fixes the dev port at 8787, so `wrangler dev` fails when the port is taken instead of moving to another one where Vite would not find it. `wrangler dev` alone serves the last SPA build and the API, like the deployed Worker. Tests call the Hono app with `app.request()` and fake bindings in Node.

Runtime and binding types come from `wrangler types` (`apps/proxy/worker-configuration.d.ts`). The file is not committed: the proxy's `postinstall` generates it on every `pnpm install`, so ESLint's type-aware rules and `tsc` find it locally and in CI, and `typecheck` regenerates it before `tsc`. A committed copy would need a `wrangler types --check` to stay current, and almost every `wrangler` release changes the generated header (the `workerd` version), so each weekly Renovate update would fail CI until someone regenerated the file by hand.

## Consequences

- No CORS configuration, no change to the CSP, and every preview URL has a working API next to its SPA.
- The SPA and the proxy deploy together as one Worker version, so they can never be out of step; a broken Worker bundle blocks the SPA deploy too, which CI catches with `wrangler deploy --dry-run`.
- The script runs only for `/api/*` and for the rare request that matches no asset, so serving the SPA stays free of Worker invocations.
- Rate limit counters are kept per Cloudflare location and are eventually consistent: a guard against abuse, not an exact quota. Users behind one IP address share it.
- Types follow `wrangler.jsonc` and the installed `wrangler` without a manual step; after editing `wrangler.jsonc`, `pnpm --filter @pipeline-builder/proxy cf-typegen` (or the next install or typecheck) updates them for the editor. An install with `--ignore-scripts` leaves them out, and then lint and `tsc` fail until `cf-typegen` runs.
- `wrangler dev` prints `Network connection lost` when a client disconnects mid-stream; that is the runtime reporting the disconnect, after which the proxy stops the provider.

## Alternatives considered

- **A separate proxy Worker on its own origin** — needs CORS with an allowlist that includes every preview URL, a wider `connect-src`, and two deploys and preview URLs to keep in step; it gains nothing for this app.
- **Calling providers from the browser** — the CSP would allow third-party origins, the client would parse each provider's stream format, and nothing would rate-limit the app.
- **The key in the JSON body** — easier to log or persist by mistake together with the request; the `Authorization` header is where keys normally travel and where logging tools expect to redact them.
- **Rate limits in KV or a Durable Object** — exact, but slower and more code; the built-in rate limiting binding is enough to stop abuse.
- **Committing the generated types** with a Renovate rule that keeps `wrangler` updates from merging themselves — works, but every update then needs a manual regeneration; generating on install needs none.
