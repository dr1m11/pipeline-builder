import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  apiKeyStorageKey,
  clearApiKey,
  getApiKey,
  isApiKeyRemembered,
  saveApiKey,
  subscribeToApiKeys,
} from './api-key-storage';

const KEY = 'pb:api-key:anthropic';
const session = window.sessionStorage;
const device = window.localStorage;

function failingWith(name: string) {
  return () => {
    throw new DOMException('Storage refused the operation', name);
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  // Also forgets keys held in memory.
  clearApiKey('anthropic');
  clearApiKey('openai');
  session.clear();
});

describe('apiKeyStorageKey', () => {
  it('keys each provider under pb:api-key:<provider>', () => {
    expect(apiKeyStorageKey('anthropic')).toBe('pb:api-key:anthropic');
    expect(apiKeyStorageKey('openai')).toBe('pb:api-key:openai');
  });
});

describe('saveApiKey', () => {
  it('keeps a key in sessionStorage by default', () => {
    expect(saveApiKey('anthropic', 'sk-ant-1', { remember: false })).toBe('session');

    expect(session.getItem(KEY)).toBe('sk-ant-1');
    expect(device.getItem(KEY)).toBeNull();
    expect(getApiKey('anthropic')).toBe('sk-ant-1');
    expect(isApiKeyRemembered('anthropic')).toBe(false);
  });

  it('keeps a remembered key in localStorage', () => {
    expect(saveApiKey('anthropic', 'sk-ant-1', { remember: true })).toBe('device');

    expect(device.getItem(KEY)).toBe('sk-ant-1');
    expect(session.getItem(KEY)).toBeNull();
    expect(getApiKey('anthropic')).toBe('sk-ant-1');
    expect(isApiKeyRemembered('anthropic')).toBe(true);
  });

  it('moves a key from one storage to the other when the mode changes', () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    saveApiKey('anthropic', 'sk-ant-2', { remember: true });

    expect(session.getItem(KEY)).toBeNull();
    expect(device.getItem(KEY)).toBe('sk-ant-2');

    saveApiKey('anthropic', 'sk-ant-3', { remember: false });

    expect(session.getItem(KEY)).toBe('sk-ant-3');
    expect(device.getItem(KEY)).toBeNull();
    expect(isApiKeyRemembered('anthropic')).toBe(false);
  });

  it('keeps the key of each provider apart', () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    saveApiKey('openai', 'sk-oai-1', { remember: true });

    expect(getApiKey('anthropic')).toBe('sk-ant-1');
    expect(getApiKey('openai')).toBe('sk-oai-1');
    expect(isApiKeyRemembered('anthropic')).toBe(false);
    expect(isApiKeyRemembered('openai')).toBe(true);
  });

  it('trims the key', () => {
    saveApiKey('anthropic', '  sk-ant-1\n', { remember: false });

    expect(getApiKey('anthropic')).toBe('sk-ant-1');
  });

  it('clears the saved key when given an empty one', () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: true });

    expect(saveApiKey('anthropic', '   ', { remember: true })).toBeNull();

    expect(getApiKey('anthropic')).toBeNull();
    expect(device.getItem(KEY)).toBeNull();
  });

  it('saves no key for a provider that takes none', () => {
    expect(saveApiKey('mock', 'sk-1', { remember: true })).toBeNull();

    expect(session.getItem('pb:api-key:mock')).toBeNull();
    expect(device.getItem('pb:api-key:mock')).toBeNull();
    expect(getApiKey('mock')).toBeNull();
  });

  it('keeps the key in memory when the browser refuses to store it', () => {
    saveApiKey('anthropic', 'sk-ant-old', { remember: true });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(failingWith('QuotaExceededError'));

    expect(saveApiKey('anthropic', 'sk-ant-new', { remember: true })).toBe('page');

    expect(getApiKey('anthropic')).toBe('sk-ant-new');
    expect(isApiKeyRemembered('anthropic')).toBe(false);
    // The older key would come back after a reload.
    expect(device.getItem(KEY)).toBeNull();
  });

  it('stores the key again once the browser lets it', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(failingWith('QuotaExceededError'));
    saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    setItem.mockRestore();

    expect(saveApiKey('anthropic', 'sk-ant-2', { remember: false })).toBe('session');

    expect(getApiKey('anthropic')).toBe('sk-ant-2');
    expect(session.getItem(KEY)).toBe('sk-ant-2');
  });

  it('keeps the key in memory when the browser denies access to storage', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(failingWith('SecurityError'));
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(failingWith('SecurityError'));

    expect(saveApiKey('anthropic', 'sk-ant-1', { remember: false })).toBe('page');
    expect(saveApiKey('openai', 'sk-oai-1', { remember: true })).toBe('page');

    expect(getApiKey('anthropic')).toBe('sk-ant-1');
    expect(getApiKey('openai')).toBe('sk-oai-1');
  });
});

describe('getApiKey', () => {
  it('finds no key until one is saved', () => {
    expect(getApiKey('anthropic')).toBeNull();
    expect(isApiKeyRemembered('anthropic')).toBe(false);
  });

  it('finds a key remembered by an earlier session', () => {
    device.setItem(KEY, 'sk-ant-1');

    expect(getApiKey('anthropic')).toBe('sk-ant-1');
    expect(isApiKeyRemembered('anthropic')).toBe(true);
  });

  it('prefers the key of this session to a remembered one', () => {
    device.setItem(KEY, 'sk-ant-remembered');
    session.setItem(KEY, 'sk-ant-session');

    expect(getApiKey('anthropic')).toBe('sk-ant-session');
    expect(isApiKeyRemembered('anthropic')).toBe(false);
  });

  it('ignores a blank stored key', () => {
    session.setItem(KEY, ' ');

    expect(getApiKey('anthropic')).toBeNull();
  });

  it('finds no key for a provider that takes none', () => {
    device.setItem('pb:api-key:mock', 'sk-1');

    expect(getApiKey('mock')).toBeNull();
    device.removeItem('pb:api-key:mock');
  });

  it('finds no key when storage cannot be read', () => {
    device.setItem(KEY, 'sk-ant-1');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(failingWith('SecurityError'));

    expect(getApiKey('anthropic')).toBeNull();
    expect(isApiKeyRemembered('anthropic')).toBe(false);
  });

  it('finds no key when the browser denies access to storage', () => {
    device.setItem(KEY, 'sk-ant-1');
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(failingWith('SecurityError'));

    expect(getApiKey('anthropic')).toBeNull();
  });
});

describe('clearApiKey', () => {
  it('forgets the key in both storages', () => {
    session.setItem(KEY, 'sk-ant-session');
    device.setItem(KEY, 'sk-ant-remembered');

    clearApiKey('anthropic');

    expect(session.getItem(KEY)).toBeNull();
    expect(device.getItem(KEY)).toBeNull();
    expect(getApiKey('anthropic')).toBeNull();
  });

  it('forgets a key kept in memory', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(failingWith('QuotaExceededError'));
    saveApiKey('anthropic', 'sk-ant-1', { remember: false });

    clearApiKey('anthropic');

    expect(getApiKey('anthropic')).toBeNull();
  });

  it('leaves the keys of other providers', () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    saveApiKey('openai', 'sk-oai-1', { remember: true });

    clearApiKey('anthropic');

    expect(getApiKey('openai')).toBe('sk-oai-1');
  });

  it('does not throw when storage refuses to remove the key', () => {
    saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(failingWith('SecurityError'));

    expect(() => {
      clearApiKey('anthropic');
    }).not.toThrow();
  });
});

describe('subscribeToApiKeys', () => {
  it('tells a listener about each save and clear until it stops listening', () => {
    const listener = vi.fn();
    const stop = subscribeToApiKeys(listener);

    saveApiKey('anthropic', 'sk-ant-1', { remember: false });
    expect(listener).toHaveBeenCalledOnce();
    clearApiKey('anthropic');
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    saveApiKey('anthropic', 'sk-ant-2', { remember: false });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('tells a listener when another tab changes API keys, until it stops listening', () => {
    const listener = vi.fn();
    const stop = subscribeToApiKeys(listener);
    const otherTabChanges = (key: string | null) => {
      window.dispatchEvent(new StorageEvent('storage', { key, storageArea: device }));
    };

    otherTabChanges('pb:api-key:openai');
    expect(listener).toHaveBeenCalledOnce();
    // The other tab cleared its whole storage.
    otherTabChanges(null);
    expect(listener).toHaveBeenCalledTimes(2);
    otherTabChanges('pb:pipeline');
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    otherTabChanges('pb:api-key:openai');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when a provider that takes no key is given one', () => {
    const listener = vi.fn();
    const stop = subscribeToApiKeys(listener);

    saveApiKey('mock', 'sk-1', { remember: false });

    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});
