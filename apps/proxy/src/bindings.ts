/**
 * The bindings the app uses, with the names `wrangler.jsonc` gives them. Each type comes from the
 * generated `Env`, so the app stops compiling when a binding is renamed or removed there; only the
 * part of each binding the app calls is required, so tests can pass plain fakes.
 */
export interface Bindings {
  /** The SPA's static assets, for requests that reach the Worker but are not for the API. */
  readonly ASSETS: Pick<Env['ASSETS'], 'fetch'>;
  /** Every LLM request takes from it, keyed by client IP. */
  readonly LLM_RATE_LIMITER: Env['LLM_RATE_LIMITER'];
  /** Requests to a provider that calls a real model also take from this stricter one. */
  readonly REAL_PROVIDER_RATE_LIMITER: Env['REAL_PROVIDER_RATE_LIMITER'];
}
