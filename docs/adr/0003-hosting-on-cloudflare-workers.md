# 0003. Hosting on Cloudflare Workers, Storybook on GitHub Pages

- Status: Accepted
- Date: 2026-10-12

## Context

The demo must open instantly for recruiters and reviewers, every PR should be reviewable in a browser, and later stages need server-side pieces:

- A5: an SSE proxy (Hono) that forwards LLM requests with the user's key, rate-limited, streaming responses;
- A9: a realtime collaboration server for Yjs.

Picking a host only for the static SPA would mean a second (and maybe third) platform later.

## Decision

- **SPA on Cloudflare Workers static assets** — an assets-only Worker (`apps/web/wrangler.jsonc`, no script) with `not_found_handling: "single-page-application"` so deep links serve `index.html`. Security headers and immutable caching for hashed assets come from `public/_headers`.
- **Production** deploys on every push to `main` (`wrangler deploy`), then a smoke request checks a deep link.
- **PR previews** via `wrangler versions upload --preview-alias pr-<number>`: a stable URL per PR that updates on every push, posted as a sticky PR comment. Worker Previews (`wrangler preview`) are in open beta; revisit when they are stable.
- **Storybook on GitHub Pages**, deployed from `main` by Actions — a `github.io` link with no extra Worker.
- **Later stages:** the proxy becomes a Worker in `apps/proxy` (Hono runs natively on Workers; SSE streaming and the rate-limiting binding are built in). Yjs collaboration can use Durable Objects. Whether the proxy shares the SPA origin (route `/api/*`) or gets its own will be decided in A5.

## Consequences

- One platform and one CLI for the app, proxy and realtime backend; generous free tier.
- Requires `CLOUDFLARE_API_TOKEN` (Workers edit scope) and `CLOUDFLARE_ACCOUNT_ID` as repository secrets; fork PRs get no preview.
- Preview aliases persist after a PR closes; they point to old versions and cost nothing.
- `_headers` applies only to static asset responses; once a Worker script exists, headers for its responses must be set in code.

## Alternatives considered

- **Vercel** — great SPA previews, but a Yjs server would need another host; Hono SSE on Vercel Functions has tighter execution limits.
- **GitHub Pages for the app** — simplest, but no PR previews, no SPA fallback without a `404.html` hack, and no place for the proxy.
- **Netlify** — similar to Vercel for the SPA; same gap for long-lived realtime connections.
