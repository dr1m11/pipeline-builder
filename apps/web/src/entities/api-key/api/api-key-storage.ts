import { LLM_PROVIDER_INFO, type LlmProvider } from '@pipeline-builder/core';

/**
 * Where a saved API key is kept:
 * - `session`: in `sessionStorage`, until the tab is closed (the default);
 * - `device`: in `localStorage`, until it is cleared ("Remember on this device");
 * - `page`: in memory, until the page is reloaded, as the browser refused to store it.
 */
export type ApiKeyPersistence = 'session' | 'device' | 'page';

export interface SaveApiKeyOptions {
  /** Keep the key in `localStorage`, beyond the session, instead of in `sessionStorage`. */
  readonly remember: boolean;
}

/** Storage key under which the API key of `provider` is kept: `pb:api-key:anthropic`. */
export function apiKeyStorageKey(provider: LlmProvider): string {
  return `pb:api-key:${provider}`;
}

// Keys the browser refused to store (storage blocked or full): they last as long as the page.
const pageKeys = new Map<LlmProvider, string>();
// Told about every change made in this tab. Other tabs are not followed.
const listeners = new Set<() => void>();

/**
 * The API key of `provider`, or null when none is saved or the provider takes none. Keys are read
 * from browser storage on every call, so a key saved by an earlier session is found too.
 */
export function getApiKey(provider: LlmProvider): string | null {
  return findApiKey(provider)?.key ?? null;
}

/** Whether the API key of `provider` is remembered on this device, that is kept in `localStorage`. */
export function isApiKeyRemembered(provider: LlmProvider): boolean {
  return findApiKey(provider)?.persistence === 'device';
}

/**
 * Saves the API key of `provider`, trimmed: in `sessionStorage`, or in `localStorage` when
 * `remember` is set, and removes it from the other one. An empty key clears the saved one. When the
 * browser refuses to store the key (storage blocked or full), it is kept in memory instead, until
 * the page is reloaded, so that it can still be used.
 *
 * Returns where the key is kept, or null when nothing was saved: the key was empty, or `provider`
 * takes no API key.
 */
export function saveApiKey(
  provider: LlmProvider,
  key: string,
  { remember }: SaveApiKeyOptions,
): ApiKeyPersistence | null {
  if (!LLM_PROVIDER_INFO[provider].needsApiKey) return null;
  const trimmed = key.trim();
  if (trimmed === '') {
    clearApiKey(provider);
    return null;
  }

  const storageKey = apiKeyStorageKey(provider);
  const session = getStorage('sessionStorage');
  const device = getStorage('localStorage');
  const [target, other] = remember ? [device, session] : [session, device];
  let persistence: ApiKeyPersistence;
  if (writeItem(target, storageKey, trimmed)) {
    removeItem(other, storageKey);
    pageKeys.delete(provider);
    persistence = remember ? 'device' : 'session';
  } else {
    // No older key may outlive the new one: it would be used again after a reload.
    removeItem(session, storageKey);
    removeItem(device, storageKey);
    pageKeys.set(provider, trimmed);
    persistence = 'page';
  }
  notify();
  return persistence;
}

/** Forgets the API key of `provider`, wherever it is kept. */
export function clearApiKey(provider: LlmProvider): void {
  const storageKey = apiKeyStorageKey(provider);
  pageKeys.delete(provider);
  removeItem(getStorage('sessionStorage'), storageKey);
  removeItem(getStorage('localStorage'), storageKey);
  notify();
}

/** Calls `listener` after each save or clear in this tab. Returns a function that stops it. */
export function subscribeToApiKeys(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** The key of `provider` and where it is kept. A key in memory is the newest one. */
function findApiKey(
  provider: LlmProvider,
): { readonly key: string; readonly persistence: ApiKeyPersistence } | null {
  if (!LLM_PROVIDER_INFO[provider].needsApiKey) return null;
  const pageKey = pageKeys.get(provider);
  if (pageKey !== undefined) return { key: pageKey, persistence: 'page' };
  const storageKey = apiKeyStorageKey(provider);
  const sessionKey = readItem(getStorage('sessionStorage'), storageKey);
  if (sessionKey !== null) return { key: sessionKey, persistence: 'session' };
  const deviceKey = readItem(getStorage('localStorage'), storageKey);
  if (deviceKey !== null) return { key: deviceKey, persistence: 'device' };
  return null;
}

// Storage can be unavailable: some privacy settings make even reading `window.localStorage` throw.

function getStorage(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[name];
  } catch {
    return null;
  }
}

/** The value under `key`, or null when there is none, it is blank, or storage cannot be read. */
function readItem(storage: Storage | null, key: string): string | null {
  try {
    const value = storage?.getItem(key) ?? null;
    return value === null || value.trim() === '' ? null : value;
  } catch {
    return null;
  }
}

/** Stores `value` under `key`; false when storage is unavailable or refuses it. */
function writeItem(storage: Storage | null, key: string, value: string): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeItem(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing else could remove it.
  }
}
