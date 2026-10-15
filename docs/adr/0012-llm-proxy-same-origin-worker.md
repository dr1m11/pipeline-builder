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
- `POST /api/llm/stream` takes an `LlmRequest` as JSON (`Content-Type: application/json`, which a cross-site form cannot send) and checks it with `LLM_REQUEST_SCHEMA`. The body may be at most 845 KB: two prompts of `LLM_PROMPT_MAX_LENGTH` characters with a margin of 4 bytes per character, plus the other fields. Real text fits (UTF-8 takes up to 3 bytes per character), though a prompt made of characters JSON escapes, at 6 bytes each, may not. The model id, which goes upstream as it is, may be at most `LLM_MODEL_MAX_LENGTH` (200) characters.
- An error before streaming starts is an `LlmErrorResponse`, `{ "error": { "code", "message" } }`: 400 for a bad body, 401 `invalid-key` for a provider that needs a key and got none, 413 for a body over the limit, 429 for a rate limit (404 for an unknown API path, 500 for an unexpected failure).
- Otherwise the answer is `text/event-stream`: `formatLlmStreamEvent` events, the text as `token`s and then `done`, or an `error` event once the status has been sent. Every stream ends with `done` or `error` unless the client disconnects. An `LlmError` from a provider keeps its code and message; any other error becomes `upstream-error` with a generic message, and the proxy never sends `network`, which belongs to the client.

**Providers.** A provider streams text chunks for a request and stops when its `AbortSignal` aborts; the signal aborts when the client disconnects (Hono's `stream.onAbort`), so an upstream request is cancelled too. The mock streams `mockCompletion` in `splitIntoTokens` chunks with a 40 ms pause before each (the pause is an option of `createMockProvider`; tests use 0) and needs no key.

Anthropic and OpenAI ([#81](https://github.com/dr1m11/pipeline-builder/issues/81)) share one adapter core, `createUpstreamProvider`: it posts the request with `fetch` (an option, so tests pass a fake), reads the body as UTF-8 server-sent events with core's `createSseParser`, and lets a reader per provider turn each event into text, the end of the answer, an error, or nothing (pings, thinking, metadata, events added later). The request shapes, checked against the providers' documentation in October 2026:

|                             | Anthropic                                              | OpenAI                                                |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| API                         | Messages: `POST https://api.anthropic.com/v1/messages` | Responses: `POST https://api.openai.com/v1/responses` |
| Key                         | `x-api-key`, with `anthropic-version: 2023-06-01`      | `Authorization: Bearer`                               |
| Prompt                      | `messages: [{ "role": "user", "content": prompt }]`    | `input: prompt`                                       |
| System prompt, unless blank | `system`                                               | `instructions`                                        |
| Max tokens                  | `max_tokens`                                           | `max_output_tokens`, at least 16 (the API's minimum)  |
| Thinking                    | `output_config: { "effort": "low" }`                   | `reasoning: { "effort": "low" }`                      |
| Also                        | `stream: true`                                         | `stream: true`, `store: false`                        |
| Text                        | `content_block_delta` with a `text_delta`              | `response.output_text.delta`                          |
| End                         | `message_stop`                                         | `response.completed` or `response.incomplete`         |
| Errors in the stream        | `error` event, by `error.type`                         | `error` event or `response.failed`, by error code     |

- **Low effort.** Both default models think before they answer: Claude Haiku 5.5 has adaptive thinking on by default and GPT-6 Luna is a reasoning model, both at medium effort by default. Thinking counts towards the max tokens, so the adapters ask for low effort and leave most of the budget to the answer; thinking deltas and reasoning items are skipped.
- **No temperature.** Current Claude models (4.7 and later, Haiku 5.5 included) answer 400 to any temperature but the default, and OpenAI's guide for GPT-6 models says to remove `temperature` (with `top_p` and `top_logprobs`) whenever reasoning effort is not `none`. The adapters do not send the node's temperature, although #81 listed it among the request fields.
- **Endings.** An answer stopped by the token limit ends with the text that fits (`done`); one stopped before any text (thinking used the whole budget) is `bad-request`, "… used up Max tokens before writing an answer". A refusal is `bad-request` too: Anthropic's `stop_reason: "refusal"`, and OpenAI's refusal content (`response.refusal.delta` or `.done`, whose text is not passed on) or content filter. A body that ends before the end event, or a connection that breaks off, is `upstream-error`.
- **Errors.** An HTTP error status maps to a code: 401 and 403 to `invalid-key`, 429 to `rate-limited`, other 4xx to `bad-request`, 5xx (and Anthropic's 529 "overloaded") to `upstream-error`; a provider that cannot be reached is `upstream-error` too. Errors in the stream map the same way: Anthropic's error types by their documented status, OpenAI's codes and types by meaning (`rate_limit_exceeded` and the billing codes, `invalid_api_key`, `invalid_prompt` and `invalid_request_error`). The messages are fixed per code and name the provider, the HTTP status and the provider's error type if it looks like one (lowercase words joined by underscores). A failure the account must fix keeps its code but says the account is out of credit or over a spending limit and points to its plan and billing: Anthropic's 402 `billing_error`, a spend limit set on the account (400 `invalid_request_error`, recognised by the start of its message) or the tier's monthly cap (429 with `enforced_spend_limit_reached`), and OpenAI's billing codes, `insufficient_quota`, `credit_balance_exhausted`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded` and `organization_usage_limit_exceeded`, as the code or the type (the newer codes keep the type `insufficient_quota`). An upstream message is never quoted, nor kept as a cause: it can repeat the request, and OpenAI's 401 quotes part of the key, masked.
- **Timeouts.** No text within 30 seconds of the request, or no end of the answer within 5 minutes, aborts the upstream request and ends the stream with `timeout`; text already streamed stays. Both limits are options of the adapters. The 5-minute cap is a trade-off: it bounds how long one request holds the Worker and the provider's connection, but it cuts a very long answer (thousands of tokens from a slow model) short. The stream endpoint also writes an SSE comment (`: ping`) every 15 seconds, which clients skip, so proxies and browsers do not close a stream that is quiet while a model thinks.

**API keys.** The client sends the user's key only for a provider that needs one (`LLM_PROVIDER_INFO`), only in the `Authorization: Bearer <key>` header of `POST /api/llm/stream`, never in a URL or the JSON body. The proxy:

- reads the key only for a provider that needs one, answers 401 `invalid-key` without calling upstream when it is missing or blank, and checks the stricter rate limit only after that;
- forwards the key only in the headers of the request to the API of the provider the request names, and never gives it to the mock;
- never stores it: no KV, Durable Objects, cache or other persistence;
- never logs it: nothing logs request headers or bodies; the only log line, for an unexpected error, holds the error's name, the method and the path; adapters write every error message themselves and never quote an upstream one;
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
- The LLM Call node's temperature has no effect on Anthropic and OpenAI (current Claude models refuse it, and OpenAI's guide says to leave it out at low effort), and none on the mock either; the node form still offers it.
- Low effort is accepted by every current model of both providers, but not by some older ones (Claude Haiku 4.5, for one, has no effort parameter): such a model answers 400, reported as `bad-request` with its error type.
- Upstream error messages are not shown, so the user sees the status and the error type (such as `invalid_request_error`) rather than the provider's explanation.
- The SSE fixtures of the adapter tests follow the providers' documented example streams and error bodies; no key was available to record live ones, so the first live run may still show differences.

## Alternatives considered

- **A separate proxy Worker on its own origin** — needs CORS with an allowlist that includes every preview URL, a wider `connect-src`, and two deploys and preview URLs to keep in step; it gains nothing for this app.
- **Calling providers from the browser** — the CSP would allow third-party origins, the client would parse each provider's stream format, and nothing would rate-limit the app.
- **The key in the JSON body** — easier to log or persist by mistake together with the request; the `Authorization` header is where keys normally travel and where logging tools expect to redact them.
- **Rate limits in KV or a Durable Object** — exact, but slower and more code; the built-in rate limiting binding is enough to stop abuse.
- **Committing the generated types** with a Renovate rule that keeps `wrangler` updates from merging themselves — works, but every update then needs a manual regeneration; generating on install needs none.
- **OpenAI Chat Completions** — streams GPT-6 Luna too (`choices[0].delta.content`, ending with `data: [DONE]`), but the Responses API is OpenAI's primary one, names every event, ends with an explicit `response.completed`, `response.incomplete` or `response.failed`, takes the system prompt as `instructions`, and `store: false` keeps the response off OpenAI's storage.
- **Reasoning effort `none` with the temperature for OpenAI** — would honour the node's temperature on GPT-6 Luna, but GPT-6 Astra and GPT-6.1 Sol do not support `none`, and Claude has no such option; a table of models and their parameters would have to be kept up to date.
- **Turning Claude's thinking off (`thinking: { "type": "disabled" }`)** — Claude Haiku 5.5 accepts it, but Claude Opus 5.5 and Fable 5.1 answer 400 and Sonnet 5.5 wants `between_tools`; low effort works on all of them.
- **Quoting upstream error messages** — more helpful ("model not found"), but they can repeat the request and, for OpenAI's 401, part of the key; the status and the error type are enough to act on.
